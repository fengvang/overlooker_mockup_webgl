document.addEventListener('mousemove',
  function (event) {
    mouseX2 = event.pageX;
    mouseY2 = glCanvas.height - event.pageY;
  })

// Runs any time the browser window is resized.
// UNSAFE: USE PROMISE TO UPDATE ONLY AT BEGINNING OF DRAW LOOP!
// TODO: Fix zoom behavior - https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html
const myObserver = new ResizeObserver(entries => {
  entries.forEach(entry => {
    width2 = entry.contentRect.width;
    height2 = entry.contentRect.height;
    testDots2.updateTilingMaxSpan(width2, height2);
    testColor2.updateTextureDimensions(testDots2.gridColumns, testDots2.gridRows);

    // Uses CSS to introduce margins so the shader doesn't warp on resize.
    glCanvas.style.width = testDots2.gridWidth + "px";
    glCanvas.style.height = testDots2.gridHeight + "px";
  });
});
const canvasResized = document.querySelector('body');
myObserver.observe(canvasResized);

function HSVtoRGB(h, s, v) {
  var r, g, b, i, f, p, q, t;
  if (arguments.length === 1) {
      s = h.s, v = h.v, h = h.h;
  }
  i = Math.floor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
  }
  return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
  };
}


class DotColor2 {
  constructor(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.totalColors = this.texWidth * this.texHeight * 4;
    this.colorArray = new Uint8Array(this.totalColors);
    this.initTexture();
  }

  initTexture() {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.colorTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.texWidth, this.texHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // Don't generate mip maps.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  colorWalk() {
    let timeColor = 0;
    let spanWidthScalar = this.texWidth * 4.0;
    for (let i = 0; i < this.totalColors; i = i + 4) {
      timeColor = performance.now() / 5;
      this.colorArray[i + 0] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.0) / spanWidthScalar));
      this.colorArray[i + 1] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.9) / spanWidthScalar));
      this.colorArray[i + 2] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.6) / spanWidthScalar));
      this.colorArray[i + 3] = 255;
    }
    let xoff = 0;
    let yoff = 0;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, xoff, yoff, this.texWidth, this.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.colorArray) 
  }

  colorRandom() {
    let timeColor = 0;
    let spanWidthScalar = this.texWidth * 4.0;
    for (let i = 0; i < this.totalColors; i = i + 4) {
      timeColor = performance.now() / 2000;
      let convert = HSVtoRGB((noise(i / 4 + timeColor)), 0.5, 1.0);
      this.colorArray[i + 0] = convert.r;
      this.colorArray[i + 1] = convert.g;
      this.colorArray[i + 2] = convert.b;
      this.colorArray[i + 3] = 255;
    }
    let xoff = 0;
    let yoff = 0;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, xoff, yoff, this.texWidth, this.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.colorArray) 
  }

  updateTextureDimensions(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.totalColors = this.texWidth * this.texHeight * 4;
    this.colorArray = new Uint8Array(this.totalColors);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.texWidth, this.texHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
}

class DotGrid2 {
  constructor(tempDotCount, canvasWidth, canvasHeight, tempPadding) {
    this.dotCount = tempDotCount;
    this.dotPadding = tempPadding;
    this.dotColorDisabled = 0;
    this.gridWidth = 0;
    this.gridHeight = 0;
    this.gridMarginX = 0;
    this.gridMarginY = 0;
    this.gridRows = 0;
    this.gridColumns = 0;
    this.tileSize = 0;
    this.updateTilingMaxSpan(canvasWidth, canvasHeight);
    this.updateMouseOverIndex();
  }

  // Main tiling algorithm:
  // Picks between spanning height or spanning width; whichever covers more area.
  // BUG: Low tilecounts cause wasted space.
  updateTilingMaxSpan(canvasWidth, canvasHeight) {
    let windowRatio = canvasWidth / canvasHeight;
    let cellWidth = Math.sqrt(this.dotCount * windowRatio);
    let cellHeight = this.dotCount / cellWidth;

    let rowsH = Math.ceil(cellHeight);
    let columnsH = Math.ceil(this.dotCount / rowsH);
    while (rowsH * windowRatio < columnsH) {
      rowsH++;
      columnsH = Math.ceil(this.dotCount / rowsH);
    }
    let tileSizeH = canvasHeight / rowsH;

    let columnsW = Math.ceil(cellWidth);
    let rowsW = Math.ceil(this.dotCount / columnsW);
    while (columnsW < rowsW * windowRatio) {
      columnsW++;
      rowsW = Math.ceil(this.dotCount / columnsW);
    }
    let tileSizeW = canvasWidth / columnsW;

    // If the tiles best span height, update grid parameters to span height else...
    if (tileSizeH < tileSizeW) {
      this.gridRows = rowsH;
      this.gridColumns = columnsH;
      this.tileSize = tileSizeH;
      this.gridWidth = columnsH * tileSizeH;
      this.gridHeight = rowsH * tileSizeH;
    } else {
      this.gridRows = rowsW;
      this.gridColumns = columnsW;
      this.tileSize = tileSizeW;
      this.gridWidth = columnsW * tileSizeW;
      this.gridHeight = rowsW * tileSizeW;
    }
    this.gridMarginX = (canvasWidth - this.gridWidth) / 2;
    this.gridMarginY = (canvasHeight - this.gridHeight) / 2;
  }

  // Finds the index of the dot underneath the mouse:
  // Treats dots as circular if there are less than 1000.
  updateMouseOverIndex() {
    let inverseScanX = Math.floor((mouseX2 - this.gridMarginX) / this.tileSize);
    let inverseScanY = Math.floor((mouseY2 - this.gridMarginY) / this.tileSize);
    let tempMouseOverIndex = inverseScanX + inverseScanY * this.gridColumns;

    if (inverseScanX < 0 || this.gridColumns <= inverseScanX || inverseScanY < 0 || this.dotCount <= tempMouseOverIndex) {
      mouseOverIndex = "UDF";
    } else if (this.dotCount < 1000) {
      let dotRadius = this.tileSize * (1 - this.dotPadding) / 2;
      let scanX = originX + this.gridMarginX + this.tileSize / 2 + inverseScanX * this.tileSize;
      let scanY = originY + this.gridMarginY + this.tileSize / 2 + inverseScanY * this.tileSize;
      let centerDistance = Math.sqrt(Math.pow(mouseX2 + originX - scanX, 2) + Math.pow(mouseY2 + originY - scanY, 2));
      if (centerDistance > dotRadius) {
        mouseOverIndex = "MISS";
      } else {
        mouseOverIndex = inverseScanX + inverseScanY * this.gridColumns;
      }
    } else {
      mouseOverIndex = inverseScanX + inverseScanY * this.gridColumns;
    }
    console.log('mouseOverIndex', mouseOverIndex);
  }
}

function updateShader(time) {
  uniforms = {
    u_time: time * 0.001,
    u_resolution: [testDots2.gridWidth, testDots2.gridHeight],
    u_mouse: [mouseX2, mouseY2],
    u_background: [gridBG.r / 255, gridBG.g / 255, gridBG.b / 255, 1.0,],
    u_gridparams: [testDots2.gridColumns, testDots2.gridRows, testDots2.tileSize],
  };
}

function render(time) {
  testColor2.colorRandom();
  updateShader(time);
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(programInfo.program);
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
  twgl.setUniforms(programInfo, uniforms);
  twgl.drawBufferInfo(gl, bufferInfo);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Prepare WebGL (compile shaders, set default texture color, bind to canvas)
const gl = document.getElementById("cgl").getContext("webgl");
const glCanvas = document.getElementById("cgl");
const programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]);

// Makes the shader draw onto a simple quad.
const arrays = {
  a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 1],
  a_texcoord: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1],
};
const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

function setup() {
  createCanvas(100, 50);
  background(153);
  line(0, 0, width, height);
}

// Needed in order to use p5 functions.
new p5();
function setup() {
  createCanvas(0, 0);
}

var mouseX2 = 0;
var mouseY2 = 0;
var originX = -glCanvas.width / 2.0;
var originY = -glCanvas.height / 2.0;
var mouseOverIndex = 0;
var width2 = 0;
var height2 = 0;
var testDotCount = 10000;
var testDotPadding = 0.05;
var gridBG = HSVtoRGB(0.3, 0.1, 1.0);
var testDots2 = new DotGrid2(testDotCount, glCanvas.width, glCanvas.height, testDotPadding);
var testColor2 = new DotColor2(testDots2.gridColumns, testDots2.gridRows);
document.body.style.backgroundColor = 'rgb(' + gridBG.r + ',' + gridBG.g + ',' + gridBG.b + ')';
