var clearTime = 0;
var clientTimer;
function clientDriver() {
  clientTimer = setInterval(function () {
    for (let i = 0; i < Math.floor(testDotCount / 8); i++) {
      testClient.randomStateChange();
    }
    // Clear clientUpdateQueue if frames aren't being rendered.
    if (clearTime == deltaTime) {
      testColor2.setStateChanges(testClient.clientUpdateQueue);
      testClient.clientUpdateQueue = [];
      //console.log("clientUpdateQueue cleared!")
    }
    clearTime = deltaTime;
  }, 50);
}

function createColorTheme(themeSelection) {
  let colorOnCall, colorAvailable, colorPreviewingTask,
    colorAfterCall, colorLoggedOut, colorBackground;

  switch (themeSelection) {
    case "user":
      // Values from CSS color picker go here.
      break;
    case "original":
      colorBackground = [235, 255, 230, 255];     // light green
      colorOnCall = [149, 255, 127, 255];         // green
      colorAvailable = [127, 255, 241, 255];      // aqua
      colorPreviewingTask = [255, 240, 127, 255]; // yellow
      colorAfterCall = [141, 127, 255, 255];      // purple
      colorLoggedOut = [211, 229, 207, 255];      // grey
      break;
    case "client_slide":
      colorBackground = [0, 0, 0, 255];        // black
      colorOnCall = [243, 108, 82, 255];        // red
      colorAvailable = [63, 191, 177, 255];     // green
      colorPreviewingTask = [0, 110, 184, 255]; // blue
      colorAfterCall = [255, 205, 52, 255];     // yellow
      colorLoggedOut = [0, 48, 70, 255];        // dark blue
      break;
  }
  let tempColorTheme = [].concat(colorLoggedOut, colorAfterCall, colorPreviewingTask,
    colorAvailable, colorOnCall, colorBackground);

  // Normalize values for the shader.
  for (let i = 0; i < tempColorTheme.length; i++) {
    tempColorTheme[i] = tempColorTheme[i] / 255;
  }

  document.body.style.backgroundColor = 'rgb(' + colorBackground[0] + ','
    + colorBackground[1] + ',' + colorBackground[2] + ')';
  return tempColorTheme;
}

document.addEventListener('mousemove',
  function (event) {
    mouseX2 = event.pageX;
    mouseY2 = glCanvas.height - event.pageY;
  })

// Runs any time the browser window is resized.
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

class ClientClass {
  constructor(tempClientCount) {
    this.clientCount = tempClientCount;
    this.clientArray = [];
    this.clientUpdateQueue = [];
    this.initClientArray();
  }

  initClientArray() {
    for (let i = 0; i < this.clientCount; i++) {
      this.clientArray.push(51 * Math.ceil(4.9 * Math.random()));
    }
  }

  clientJoin() {
  }

  clientLeave() {
  }

  randomStateChange() {
    let randomSelect = Math.floor(Math.random() * this.clientCount);
    let p = Math.random();
    let currentState = 0;

    if (p < 0.01) {
      currentState = 255;  // LoggedOut
    } else if (p < 0.20) {
      currentState = 204;  // AfterCall
    } else if (p < 0.35) {
      currentState = 153;  // PreviewingTask
    } else if (p < 0.65) {
      currentState = 102;  // Available
    } else if (p < 0.70) {
      currentState = 51;   // OnCall
    } else {
      currentState = 51;
    }
    let texIndex = this.getTextureIndex(randomSelect);
    this.enqueueStateChanges(texIndex, currentState);
  }

  // This function maps the internal client index onto the texture. 1:1 for now.
  getTextureIndex(clientArrayIndex) {
    return 4 * clientArrayIndex;
  }

  enqueueStateChanges(tempIndex, tempCurrent) {
    this.clientUpdateQueue.push({
      textureIndex: tempIndex,
      currentState: tempCurrent,
    });
  }
}

class DotColor2 {
  constructor(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.totalColors = this.texWidth * this.texHeight;
    this.colorArray = new Uint8Array(this.totalColors * 4);
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
    for (let i = 0; i < this.colorArray.length; i += 4) {
      timeColor = performance.now() / 5;
      this.colorArray[i + 0] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.0) / spanWidthScalar));
      this.colorArray[i + 1] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.9) / spanWidthScalar));
      this.colorArray[i + 2] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.6) / spanWidthScalar));
      this.colorArray[i + 3] = 255;
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.texWidth, this.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.colorArray)
  }

  updateTexture() {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.texWidth, this.texHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.colorArray);
  }

  updateTextureDimensions(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.totalColors = tempWidth * tempHeight;

    let newColorArray = new ArrayBuffer(tempWidth * tempHeight * 4 * 8);
    new Uint8Array(newColorArray).set(new Uint8Array(this.colorArray));
    this.colorArray = new Uint8Array(newColorArray, 0, tempWidth * tempHeight * 4);
  }

  setColorArray(initialArray) {
    for (let i = 0; i < this.colorArray.length; i += 4) {
      this.colorArray[i] = 0;
      this.colorArray[i + 1] = initialArray[i];
      this.colorArray[i + 2] = 0;
      this.colorArray[i + 3] = 0;
    }
  }

  setStateChanges(stateChangeArray) {
    var tempIndex = 0;
    var tempState = 0;
    var tempTimer = 0;
    var tempBuffer = 0;
    for (let i = 0; i < stateChangeArray.length; i++) {
      tempIndex = stateChangeArray[i].textureIndex;
      tempState = stateChangeArray[i].currentState;
      tempTimer = this.colorArray[tempIndex + 3];

      switch (tempTimer) {
        case 0: // Animation not started.
          this.colorArray[tempIndex + 1] = tempState; // Update endColor.
          this.colorArray[tempIndex + 2] = 0; // Clear the buffer.
          break;
        case 255: // Animation finished.
          this.colorArray[tempIndex + 0] = this.colorArray[tempIndex + 1]; // Swap startColor and endColor.
          this.colorArray[tempIndex + 1] = tempState; // Update endColor.
          this.colorArray[tempIndex + 2] = 0; // Clear the buffer.
          this.colorArray[tempIndex + 3] = 0; // Reset timer.
          break;
        default: // Animation ongoing.
          this.colorArray[tempIndex + 2] = tempState; // Store in buffer. 
      }
    } // Don't forget to empty stateChangeArray after calling this function!
  }

  // TODO: move animation updates to a texture shader.
  updateAnimations(timeStretch) {
    for (let i = 0; i < this.colorArray.length; i += 4) {
      if (this.colorArray[i + 2] != 0 && this.colorArray[i + 3] >= 255) {
        this.colorArray[i] = this.colorArray[i + 1]; // Swap startColor with endColor.
        this.colorArray[i + 1] = this.colorArray[i + 2]; // Swap buffer into endColor.
        this.colorArray[i + 2] = 0; // Reset timer.
        this.colorArray[i + 3] = 0; // Clear buffer.
      } else {
        this.colorArray[i + 3] = Math.min(this.colorArray[i + 3] + timeStretch * 4.25 * 60 * Math.max(deltaTime, 0.01667), 255);
      }
    }
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

function updateUniforms(time) {
  uniforms = {
    u_time: time,
    u_resolution: [glCanvas.width, glCanvas.height],
    u_mouse: [mouseX2, mouseY2],
    u_gridparams: [testDots2.gridColumns, testDots2.gridRows, testDots2.tileSize],
    u_colortheme: dotColorTheme,
  };
}

function render(time) {
  time *= 0.001;
  deltaTime = time - prevTime;
  prevTime = time;
  updateUniforms(deltaTime);

  testColor2.setStateChanges(testClient.clientUpdateQueue);
  testClient.clientUpdateQueue = [];
  testColor2.updateAnimations(1.666);
  testColor2.updateTexture();

  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(programInfo.program);
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
  twgl.setUniforms(programInfo, uniforms);
  twgl.drawBufferInfo(gl, bufferInfo);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Prepare WebGL (compile shaders, bind to canvas).
const gl = document.getElementById("cgl").getContext("webgl");
const glCanvas = document.getElementById("cgl");
const programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]);

// Makes the shader draw onto a simple quad.
const arrays = {
  a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 1],
  a_texcoord: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1],
};
const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

var prevTime = 0;
var deltaTime = 0;
var mouseX2 = 0;
var mouseY2 = 0;
var originX = -glCanvas.width / 2.0;
var originY = -glCanvas.height / 2.0;
var mouseOverIndex = 0;
var width2 = 0;
var height2 = 0;
var dotColorTheme = createColorTheme("client_slide");
var testDotCount = 10000;
var testDotPadding = 0.05;
var testClient = new ClientClass(testDotCount);
testClient.initClientArray();
clientDriver();
var testDots2 = new DotGrid2(testDotCount, glCanvas.width, glCanvas.height, testDotPadding);
var testColor2 = new DotColor2(testDots2.gridColumns, testDots2.gridRows);

testColor2.setColorArray(testClient.clientArray);
