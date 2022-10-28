var gridMain, gridSearch, texMain, texSearch,
  userSim;
var gl, gridCanvas, canvasResized, programInfo, bufferInfo;
var colorTheme, mouseX, mouseY, prevTime, deltaTime;

function setup() {
  initWebGL("cgl");
  let tempUserCount = 10000;
  let dotPadding = 0.05;
  let simulationTickRate = 50;
  colorTheme = setColorTheme("clientSlide");
  userSim = new UserSimulator(tempUserCount, simulationTickRate);
  gridMain = new UserGrid(tempUserCount, gridCanvas.width, gridCanvas.height, dotPadding);
  texMain = new DataTexture(gridMain.gridColumns, gridMain.gridRows);
  userSim.updatesPerTick = tempUserCount / 8;
  canvasResized = document.querySelector("body");
  myObserver.observe(canvasResized);

  requestAnimationFrame(render);
}

// Main draw loop.
function render(time) {
  time *= 0.001;
  deltaTime = time - prevTime;
  updateUniforms(deltaTime);
  prevTime = time;

  userSim.setStateChanges(texMain.texArray);
  texMain.updateAnimations(1.666);
  texMain.updateTexture();

  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(programInfo.program);
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
  twgl.setUniforms(programInfo, uniforms);
  twgl.drawBufferInfo(gl, bufferInfo);
  requestAnimationFrame(render);
}

function updateUniforms(time) {
  uniforms = {
    u_time: time,
    u_resolution: [gridCanvas.width, gridCanvas.height],
    u_mouse: [mouseX, mouseY],
    u_gridparams: [gridMain.gridColumns, gridMain.gridRows, gridMain.tileSize],
    u_colortheme: colorTheme,
  };
}

function initWebGL(canvasID) {

  // Bind to canvas, compile shaders.
  gridCanvas = document.getElementById(canvasID);
  gl = gridCanvas.getContext("webgl", { alpha: false });
  programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]);

  // Makes the shader draw onto a simple quad.
  const arrays = {
    a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 1],
    a_texcoord: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1],
  };
  bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
}

// Runs any time the browser window is resized.
const myObserver = new ResizeObserver(entries => {
  entries.forEach(entry => {
    let tempWidth = entry.contentRect.width;
    let tempHeight = entry.contentRect.height;
    gridMain.updateTilingMaxSpan(tempWidth, tempHeight);
    texMain.updateTextureDimensions(gridMain.gridColumns, gridMain.gridRows);

    // Uses CSS to introduce margins so the shader doesn't warp on resize.
    gridCanvas.style.width = gridMain.gridWidth + "px";
    gridCanvas.style.height = gridMain.gridHeight + "px";
  });
});

function setColorTheme(themeSelection) {
  let colorOnCall, colorAvailable, colorPreviewingTask,
    colorAfterCall, colorLoggedOut, colorBackground;

  switch (themeSelection) {
    case 'user':
      // Values from CSS color picker go here.
      break;
    case 'original':
      colorBackground = [235, 255, 230, 255];
      colorOnCall = [149, 255, 127, 255];
      colorAvailable = [127, 255, 241, 255];
      colorPreviewingTask = [255, 240, 127, 255];
      colorAfterCall = [141, 127, 255, 255];
      colorLoggedOut = [211, 229, 207, 255];
      break;
    case 'clientSlide':
      colorBackground = [0, 0, 0, 255];
      colorOnCall = [243, 108, 82, 255];
      colorAvailable = [63, 191, 177, 255];
      colorPreviewingTask = [0, 110, 184, 255];
      colorAfterCall = [255, 205, 52, 255];
      colorLoggedOut = [0, 48, 70, 255];
      break;
  }
  let tempColorTheme = [].concat(colorLoggedOut, colorAfterCall, colorPreviewingTask,
    colorAvailable, colorOnCall, colorBackground);

  // Normalize values for the shader.
  for (let i = 0; i < tempColorTheme.length; i++) {
    tempColorTheme[i] = tempColorTheme[i] / 255;
  }

  document.body.style.backgroundColor = "rgb(" + colorBackground[0] + ","
    + colorBackground[1] + "," + colorBackground[2] + ")";
  return tempColorTheme;
}

class UserSimulator {
  constructor(tempUserCount, tempTickRate) {
    this.userCount = tempUserCount;
    this.userArray = [];

    this.probArray = [];
    this.updatesPerTick = 0;
    this.simTickRate = tempTickRate;
    this.stateUpdateQueue = [];
    this.initUserArray();
    this.initProbArray();

    setInterval(
      this.randomStateChange.bind(this),
      this.simTickRate);
  }

  initUserArray() {
    for (let i = 0; i < this.userCount; i++) {
      this.userArray.push(51 * Math.ceil(4.9 * Math.random()));
    }
  }

  initProbArray() {
    this.probArray = {
      loggedOut: 0.01, afterCall: 0.2, prevTask: 0.35,
      avail: 0.65, onCall: 0.7
    };
  }

  userJoin() {
  }

  userLeave() {
  }

  // Each number corresponds to a multiple of 1/5 which give
  // safer floats after normalization.
  // TODO: implement limiting mechanism that dumps queue if it has grown too large.
  randomStateChange() {
    for (let i = 0; i < this.updatesPerTick; i++) {
      let randomSelect = Math.floor(Math.random() * this.userCount);
      let p = Math.random();
      let currentState = 0;

      if (p < this.probArray.loggedOut) {
        currentState = 255;
      } else if (p < this.probArray.afterCall) {
        currentState = 204;
      } else if (p < this.probArray.prevTask) {
        currentState = 153;
      } else if (p < this.probArray.avail) {
        currentState = 102;
      } else if (p < this.probArray.onCall) {
        currentState = 51;
      } else {
        currentState = 51;
      }
      this.pushStateChange(this.getTextureIndex(randomSelect), currentState);
    }
  }

  getTextureIndex(userArrayIndex) {
    return 4 * userArrayIndex;
  }

  pushStateChange(tempIndex, tempCurrent) {
    this.stateUpdateQueue.push({
      textureIndex: tempIndex,
      currentState: tempCurrent,
    });
  }

  // Javascript Space->Shader Space:
  // UInt8Array(0...255)->vec4(0...1)
  // {UI8[0], UI8[1], UI8[2], UI8[3]}->{vec4.r, vec4.g, vec4.b, vec4.a}
  // Both Domains: {startColor, endColor, buffColor, Timer}
  // TODO: implement w/ single tex channel via float packing.
  setStateChanges(tempTexArray) {
    var j, tempState, tempTimer;
    for (let i = 0; i < this.stateUpdateQueue.length; i++) {
      j = this.stateUpdateQueue[i].textureIndex;
      tempState = this.stateUpdateQueue[i].currentState;
      tempTimer = tempTexArray[j + 3];
      switch (tempTimer) {
        case 0:
          // Animation not started.
          tempTexArray[j + 1] = tempState;           // newColor->endColor.
          tempTexArray[j + 2] = 0;                   // 0->buffColor.
          break;
        case 255:
          // Animation finished.
          tempTexArray[j + 0] = tempTexArray[j + 1]; // endColor->startColor.
          tempTexArray[j + 1] = tempState;           // newColor->endColor.
          tempTexArray[j + 2] = 0;                   // 0->buffColor.
          tempTexArray[j + 3] = 0;                   // 0->Timer.
          break;
        default:
          // Animation ongoing.
          tempTexArray[j + 2] = tempState;           // newColor->buffColor. 
      }
    }
    this.stateUpdateQueue = [];
  }
}

class DataTexture {
  constructor(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.totalColors = this.texWidth * this.texHeight;
    this.texArray = new Uint8Array(this.totalColors * 4);
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

  updateTexture() {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.texWidth, this.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.texArray)
  }

  updateTextureDimensions(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
      if (this.totalColors > tempWidth * tempHeight) {
        this.texArray = this.texArray.subarray(0, tempWidth * tempHeight * 4);
        this.totalColors = tempWidth * tempHeight;
      } else {
        let tempArray = new ArrayBuffer(tempWidth * tempHeight * 4 * 8);
        new Uint8Array(tempArray).set(new Uint8Array(this.texArray));
        this.texArray = new Uint8Array(tempArray, 0, tempWidth * tempHeight * 4);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.texWidth, this.texHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  setTexArray(initialArray) {
    for (let i = 0; i < this.texArray.length; i += 4) {
      this.texArray[i] = 0;
      this.texArray[i + 1] = initialArray[i];
      this.texArray[i + 2] = 0;
      this.texArray[i + 3] = 0;
    }
  }

  // TODO: move animation updates to a texture shader.
  updateAnimations(timeStretch) {
    for (let i = 0; i < this.texArray.length; i += 4) {
      // Animation has completed.
      if (this.texArray[i + 2] != 0 && this.texArray[i + 3] >= 255) {
        this.texArray[i] = this.texArray[i + 1];     // endColor->startColor.
        this.texArray[i + 1] = this.texArray[i + 2]; // buffColor->endColor.
        this.texArray[i + 2] = 0;                    // 0->buffColor.
        this.texArray[i + 3] = 0;                    // 0->timer.
      } else {
        this.texArray[i + 3] = Math.min(this.texArray[i + 3] + timeStretch * 4.25 * 60 * Math.max(deltaTime, 0.01667), 255);
      }
    }
  }

  // Test animation for showcasing framerate.
  colorWalk() {
    let timeColor = 0;
    let spanWidthScalar = this.texWidth * 4.0;
    for (let i = 0; i < this.texArray.length; i += 4) {
      timeColor = performance.now() / 5;
      this.texArray[i + 0] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.0) / spanWidthScalar));
      this.texArray[i + 1] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.9) / spanWidthScalar));
      this.texArray[i + 2] = 127 + 64 * (1 - Math.cos(3.1415926 * 2 * (i + timeColor * 1.6) / spanWidthScalar));
      this.texArray[i + 3] = 255;
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.texWidth, this.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.texArray)
  }
}

class UserGrid {
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

      // Partial pixel values cause artifacting.
      this.gridWidth = Math.floor(columnsW * tileSizeW);
      this.gridHeight = Math.floor(rowsW * tileSizeW);
    }
    this.gridMarginX = (canvasWidth - this.gridWidth) / 2;
    this.gridMarginY = (canvasHeight - this.gridHeight) / 2;
  }

  // Finds the index of the dot underneath the mouse:
  // Treats dots as circular if there are less than 1000.
  getMouseOverIndex() {
    let inverseScanX = Math.floor((mouseX - this.gridMarginX) / this.tileSize);
    let inverseScanY = Math.floor((mouseY - this.gridMarginY) / this.tileSize);
    let tempMouseOverIndex = inverseScanX + inverseScanY * this.gridColumns;
    let mouseOverIndex;

    if (inverseScanX < 0 || this.gridColumns <= inverseScanX || inverseScanY < 0 || this.dotCount <= tempMouseOverIndex) {
      mouseOverIndex = "UDF";
    } else if (this.dotCount < 1000) {
      let dotRadius = this.tileSize * (1 - this.dotPadding) / 2;
      let scanX = originX + this.gridMarginX + this.tileSize / 2 + inverseScanX * this.tileSize;
      let scanY = originY + this.gridMarginY + this.tileSize / 2 + inverseScanY * this.tileSize;
      let centerDistance = Math.sqrt(Math.pow(mouseX + origin - scanX, 2) + Math.pow(mouseY + originY - scanY, 2));
      if (centerDistance > dotRadius) {
        mouseOverIndex = "MISS";
      } else {
        mouseOverIndex = inverseScanX + inverseScanY * this.gridColumns;
      }
    } else {
      mouseOverIndex = inverseScanX + inverseScanY * this.gridColumns;
    }
    console.log('mouseOverIndex', mouseOverIndex);
    return mouseOverIndex;
  }
}

setup();
