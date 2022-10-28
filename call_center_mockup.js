var gridMain, gridSearch, texMain, texSearch, userSim;
var gl, gridCanvas, canvasResized, programInfo, bufferInfo;
var colorTheme, mouseX, mouseY, prevTime, deltaTime;

function setup(tempLayout) {
  switch (tempLayout) {
    case "random":
      colorTheme = setColorTheme("random");
    default:
      if (colorTheme == undefined) {
        colorTheme = setColorTheme("clientSlide");
      }

      initWebGL("cgl");
      let tempUserCount = 10000;
      let dotPadding = 0.05;
      let simulationTickRate = 50; // In milliseconds.
      gridMain = new UserGrid(tempUserCount, gridCanvas.width, gridCanvas.height, dotPadding);
      canvasResized = document.querySelector("body");
      userSim = new UserSimulator(tempUserCount, simulationTickRate);
      texMain = new DataTexture(gridMain.gridColumns, gridMain.gridRows);
      userSim.updatesPerTick = tempUserCount / 16;
      myObserver.observe(canvasResized);
  }
  requestAnimationFrame(render);
}

function drawLayout(tempLayout) {
  switch (tempLayout) {
    default:
      userSim.setStateChanges(texMain.texArray);
      texMain.updateAnimations(2);
      texMain.updateTexture();
  }
}

// Main draw loop.
function render(time) {
  time *= 0.001;
  deltaTime = time - prevTime;
  updateUniforms(deltaTime);
  prevTime = time;
  drawLayout(myLayout);

  // May be possible to move some of these out of the draw loop for better perf.
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
  gridCanvas = document.getElementById(canvasID);
  gl = gridCanvas.getContext("webgl", { alpha: false });
  programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]); // Compile shaders.

  // Makes the shader draw onto a simple quad.
  const arrays = {
    a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 1],
    a_texcoord: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1],
  };
  bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
}

// Runs on window resize:
const myObserver = new ResizeObserver(entries => {
  entries.forEach(entry => {
    gridMain.updateTilingMaxSpan(entry.contentRect.width, entry.contentRect.height);
    texMain.updateTextureDimensions(gridMain.gridColumns, gridMain.gridRows);

    // Uses CSS to introduce margins so the shader doesn't warp on resize.
    gridCanvas.style.width = gridMain.gridWidth + "px";
    gridCanvas.style.height = gridMain.gridHeight + "px";
  });
});

// Simple theme selection:
// The values are sent through an array uniform and used by the
// fragment shader when evaluating the data texture.
function setColorTheme(themeSelection) {
  let colorOnCall, colorAvailable, colorPreviewingTask,
    colorAfterCall, colorLoggedOut, colorBackground;

  switch (themeSelection) {
    case "user":
      // Values from CSS color picker go here.
      break;
    case "random":
      break;
    case "original":
      colorBackground = [235, 255, 230, 255];
      colorOnCall = [149, 255, 127, 255];
      colorAvailable = [127, 255, 241, 255];
      colorPreviewingTask = [255, 240, 127, 255];
      colorAfterCall = [141, 127, 255, 255];
      colorLoggedOut = [211, 229, 207, 255];
      break;
    case "clientSlide":
      colorBackground = [0, 0, 0, 255];
      colorOnCall = [243, 108, 82, 255];
      colorAvailable = [63, 191, 177, 255];
      colorPreviewingTask = [0, 110, 184, 255];
      colorAfterCall = [255, 205, 52, 255];
      colorLoggedOut = [0, 48, 70, 255];
      break;
  }

  let tempColorTheme = [];
  if (themeSelection == "random") {
    for (let i = 0; i < 4 * 5; i++) {
      tempColorTheme[i] = 255 * Math.random();
    }
  } else {
    tempColorTheme = [].concat(colorLoggedOut, colorAfterCall, colorPreviewingTask,
      colorAvailable, colorOnCall, colorBackground);
  }

  // Normalize values for the shader.
  // POTENTIAL BUG: normalization on the Javascript side may cause
  // less accurate colors - needs research. 
  for (let i = 0; i < tempColorTheme.length; i++) {
    tempColorTheme[i] = tempColorTheme[i] / 255;
  }

  document.body.style.backgroundColor = "rgb(" + tempColorTheme[20] + ","
    + tempColorTheme[21] + "," + tempColorTheme[22] + ")";
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
      avail: 0.65, onCall: 0.7,
    };
  }

  userJoin() {
  }

  userLeave() {
  }

  // Enqueues a number of state changes each tick:
  // Javascript Space->Shader Space:
  // {0, 51, 102, 153, 204, 255}->{0.0, 0.2, 0.4, 0.6, 0.8, 1.0} 
  //
  // TODO: pop queues that grow too large before additional pushes.
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
  // UInt8Array(0...255)->vec4(0.0...1.0)
  // {UI8[0], UI8[1], UI8[2], UI8[3]}->{vec4.r, vec4.g, vec4.b, vec4.a} = 
  // = {startColor, endColor, buffColor, Timer}
  // TODO: implement w/ single channel via bit packing.
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
    this.texelCount = this.texWidth * this.texHeight;
    this.texArray = new Uint8Array(this.texelCount * 4);
    this.initTexture();
  }

  initTexture() {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.dataTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.dataTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.texWidth, this.texHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // Don't generate mip maps.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  blankTexture() {
    this.texArray.fill(0);
  }

  updateTexture() {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.texWidth, this.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.texArray)
  }

  // Resizes the texArray used by gl.texSubImage2D to create the texture:
  // Sets a new end point for texArray if the texture shrinks.
  // Copies values using an ArrayBuffer if the texture grows. 
  //
  // TODO: copyTexSubImage2D + framebuffer would be faster + smoother; would need to move
  // state updates to a separate texture + write a shader for it first.
  // POTENTIAL BUG: texture shrinking may cause orphaning, needs a look at.
  updateTextureDimensions(tempWidth, tempHeight) {
    var tempTexelCount = tempWidth * tempHeight;
    if (this.texWidth > tempWidth && this.texHeight > tempHeight) {
      this.texArray = this.texArray.subarray(0, tempTexelCount * 4);
    } else if (this.texelCount > tempTexelCount) {
      this.texArray = this.texArray.subarray(0, tempTexelCount * 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tempWidth, tempHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    } else {
      let tempArray = new ArrayBuffer(tempTexelCount * 4 * 8);
      new Uint8Array(tempArray).set(new Uint8Array(this.texArray));
      this.texArray = new Uint8Array(tempArray, 0, tempTexelCount * 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tempWidth, tempHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.texelCount = tempTexelCount;
  }

  setTexArray(initialArray) {
    for (let i = 0; i < this.texArray.length; i += 4) {
      this.texArray[i] = 0;
      this.texArray[i + 1] = initialArray[i];
      this.texArray[i + 2] = 0;
      this.texArray[i + 3] = 0;
    }
  }

  // Increments the timer and pops buffColor:
  // Javascript Space->Shader Space:
  // {UI8[0], UI8[1], UI8[2], UI8[3]}->{vec4.r, vec4.g, vec4.b, vec4.a} = 
  // = {startColor, endColor, buffColor, Timer}
  //
  // TODO: move animation updates to a buffer + new fragment shader.
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

  // Test animation for showcasing performance.
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

const myLayout = "random";
setup(myLayout);
