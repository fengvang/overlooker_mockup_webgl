//////////////////////////////////////////////////////////////////////////////////////////////
// WEBGL
//////////////////////////////////////////////////////////////////////////////////////////////

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
    testColor2.updateTextureD();

    // Uses CSS to introduce margins so the shader doesn't warp on resize.
    glCanvas.style.width = testDots2.gridWidth + "px";
    glCanvas.style.height = testDots2.gridHeight + "px";
  });
});

class DotColor2 {
  constructor() {
    this.totalColors = testDots2.gridRows * testDots2.gridColumns * 3;
    this.colorArray = new Uint8Array(this.totalColors);
  }

  colorWalk() {
    let timeColor = 0;
    let spanWidthScalar = testDots2.gridColumns * 3.0;
    let spanHeightScalar = testDots2.gridRows * 3.0;
    for (let i = 0; i < this.totalColors; i = i + 3) {
      timeColor = performance.now() / 5;
      this.colorArray[i + 0] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.0) / spanWidthScalar));
      this.colorArray[i + 1] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.9) /spanWidthScalar));
      this.colorArray[i + 2] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.6) /spanWidthScalar));

    }
  }

  updateTextureD() {
    this.totalColors = testDots2.gridRows * testDots2.gridColumns * 3;
    this.colorArray = new Uint8Array(this.totalColors);
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

// Prepare WebGL (compile shaders, set default texture color, bind to canvas)
const gl = document.getElementById("cgl").getContext("webgl");
const glCanvas = document.getElementById("cgl");
const programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]);

var mouseX2 = 0;
var mouseY2 = 0;
var originX = -glCanvas.width / 2.0;
var originY = -glCanvas.height / 2.0;
var mouseOverIndex = 0;
var width2 = 0;
var height2 = 0;
var clientColorTexture = 0;
var testDotCount = 10000;
var testDotPadding = 0.05;
var testDots2 = new DotGrid2(testDotCount, glCanvas.width, glCanvas.height, testDotPadding);
var testColor2 = new DotColor2(testDots2.gridColumns * testDots2.gridRows);
const canvasResized = document.querySelector('body');
myObserver.observe(canvasResized);


// Makes the shader draw onto a simple quad.
const arrays = {
  a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 1],
  a_texcoord: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1],
};
const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

function updateShader(time) {
  uniforms = {
    u_time: time * 0.001,
    u_resolution: [testDots2.gridWidth, testDots2.gridHeight],
    u_mouse: [mouseX2, mouseY2],
    u_background: [1.0, 1.0, 1.0],
    u_padding: testDots2.dotPadding,
    u_gridparams: [testDots2.gridColumns, testDots2.gridRows, testDots2.tileSize],
    u_texture: clientColorTexture,
  };
}

function updateTexture() {
  testColor2.colorWalk();
  clientColorTexture = twgl.createTexture(gl, {
    internalFormat: gl.RGB8,
    format: gl.RGB,
    type: gl.UNSIGNED_BYTE,
    minMag: gl.NEAREST,
    wrap: gl.CLAMP_TO_EDGE,
    unpackAlignment: 1,
    flipY: 1,
    width: testDots2.gridColumns,
    height: testDots2.gridRows,
    src: testColor2.colorArray,
  })
}

function render(time) {
  updateTexture();
  updateShader(time);
  //testDots2.updateMouseOverIndex();
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(programInfo.program);
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
  twgl.setUniforms(programInfo, uniforms);
  twgl.drawBufferInfo(gl, bufferInfo);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

/*
function sleep (time) {
return new Promise((resolve) => setTimeout(resolve, time));
}
 

sleep(500).then(() => {
windowResized();
});
*/