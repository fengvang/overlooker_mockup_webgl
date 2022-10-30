var gridMain, gridSearch, texMain, texSearch, userSim;
var gl, gridCanvas, canvasResized, programInfo, bufferInfo;
var colorTheme, mouseX, mouseY, prevTime, runTime, animRate;

function setup(tempLayout) {
  let tempUserCount, dotPadding, simTickRate;
  initWebGL("cgl");

  switch (tempLayout) {
    case "random":
      colorTheme = setColorTheme("random");
      animRate = 3.0;
      tempUserCount = 10000;
      dotPadding = 0.05;
      simTickRate = 25; // In milliseconds.
      upPerTick = tempUserCount / 8;
      gridMain = new UserGrid(tempUserCount, gridCanvas.width, gridCanvas.height, dotPadding);
      canvasResized = document.querySelector("body");
      userSim = new UserSimulator(tempUserCount, simTickRate);
      texMain = new DataTexture(gridMain.gridColumns, gridMain.gridRows);
      userSim.updatesPerTick = upPerTick;
      break;
    case "walk":

      break;
    default:
      colorTheme = setColorTheme("clientSlide");
      animRate = 1.0;
      tempUserCount = 10000;
      dotPadding = 0.0;
      simTickRate = 50; // In milliseconds.
      upPerTick = tempUserCount / 8;
      gridMain = new UserGrid(tempUserCount, gridCanvas.width, gridCanvas.height, dotPadding);
      canvasResized = document.querySelector("body");
      userSim = new UserSimulator(tempUserCount, simTickRate);
      texMain = new DataTexture(gridMain.gridColumns, gridMain.gridRows);
      userSim.updatesPerTick = upPerTick;
  }
  myObserver.observe(canvasResized);
  requestAnimationFrame(render);
}

function initWebGL(canvasID) {
  gridCanvas = document.getElementById(canvasID);
  gl = gridCanvas.getContext("webgl", { alpha: false });
  programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]); // Compile shaders.
  const arrays = {
    a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 1], // Simple quad.
    a_texcoord: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1],
  };
  bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
}

function drawLayout(tempLayout) {
  var deltaTime;
  switch (tempLayout) {
    case "random":
      // Varies which colors are more likey to spawn.
      if (Math.random() > 0.99) {
        userSim.randProbArray();
      }
  }
  userSim.setStateChanges(texMain.texArray);
  texMain.updateTexture();
  texMain.updateAnimations(animRate);
}

// Main draw loop:
function render(time) {
  runTime = time * 0.001;
  deltaTime = runTime - prevTime;
  prevTime = runTime;
  updateUniformsFrequent(deltaTime);

  drawLayout(myLayout);

  // WebGL stuff
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(programInfo.program);
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
  twgl.setUniforms(programInfo, uniformsFrequent);
  twgl.drawBufferInfo(gl, bufferInfo);
  requestAnimationFrame(render); // Repeat loop.
}

function updateUniformsFrequent(time) {
  uniformsFrequent = {
    u_time: time,
    u_timescale: animRate,
    u_resolution: [gridCanvas.width, gridCanvas.height],
    u_mouse: [mouseX, mouseY],
    u_gridparams: [gridMain.gridColumns, gridMain.gridRows, gridMain.tileSize],
    u_colortheme: colorTheme,
  };
}

function updateUniformsInfrequent() {
  var
    uniformsInfrequent = {

    }
}

// Update grid and canvas body parameters on resize:  
const myObserver = new ResizeObserver(entries => {
  entries.forEach(entry => {
    gridMain.updateTilingMaxSpan(entry.contentRect.width, entry.contentRect.height);
    texMain.updateTextureDimensions(gridMain.gridColumns, gridMain.gridRows);
    gridCanvas.style.width = gridMain.gridWidth + "px";
    gridCanvas.style.height = gridMain.gridHeight + "px";
  });
});

// Theme selection:
function setColorTheme(themeSelection) {
  let colorOnCall, colorAvailable, colorPreviewingTask,
    colorAfterCall, colorLoggedOut, colorBackground, bgIndex;
  let tempColorTheme = [];

  switch (themeSelection) {
    case "user":
      // Values from CSS color picker go here.
      break;
    case "random":
      for (let i = 0; i < 6 * 4; i += 4) {
        tempColorTheme[i] = 255 * Math.random();
        tempColorTheme[i + 1] = 255 * Math.random();
        tempColorTheme[i + 2] = 255 * Math.random();
        tempColorTheme[i + 3] = 255;
      }
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

  if (themeSelection != "random") {
    tempColorTheme = [].concat(colorLoggedOut, colorAfterCall, colorPreviewingTask,
      colorAvailable, colorOnCall, colorBackground);
  }

  bgIndex = tempColorTheme.length;
  document.body.style.backgroundColor = "rgb(" + tempColorTheme[bgIndex - 4] + ","
    + tempColorTheme[bgIndex - 3] + "," + tempColorTheme[bgIndex - 2] + ")";

  // Normalize values for the shader.
  for (let i = 0; i < tempColorTheme.length; i++) {
    tempColorTheme[i] = tempColorTheme[i] / 255;
  }
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

  randProbArray() {
    let tempArray = [];
    for (let i = 0; i < 5; i++) {
      tempArray.push(0.5 + 0.5 * Math.sin(2 * Math.PI * Math.random()));
    }
    tempArray.sort((a, b) => b - a);
    this.probArray.loggedOut = tempArray[4];
    this.probArray.afterCall = tempArray[3];
    this.probArray.prevTask = tempArray[2];
    this.probArray.avail = tempArray[1];
    this.probArray.onCall = tempArray[0];
  }

  userJoin() {
  }

  userLeave() {
  }

  // Enqueues a number of state changes each tick:
  // Javascript Space->Shader Space:
  // {0, 51, 102, 153, 204, 255}->{0.0, 0.2, 0.4, 0.6, 0.8, 1.0} 
  // TODO: pop queues that grow too large before additional pushes.
  randomStateChange() {
    var currentState = 0;
    for (let i = 0; i < this.updatesPerTick; i++) {

      // Noise function:
      var u = this.userCount;
      var o = i / u;
      var t = performance.now();
      var s = 2 + 1.1 * Math.sin(2 * o * t) + Math.sin(Math.PI * o * t);
      s = Math.min(Math.max(parseInt(0.25 * s * u, 0)), u);

      var p = Math.random();
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
        currentState = 51 * Math.ceil(Math.random() * 4.999);
      }
      this.pushStateChange(this.getTextureIndex(s), currentState);
    }
  }

  // Maps user ID/index onto the texture:
  // Need something that can handle persistance.
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
          if (tempTexArray[j] != 0 && tempTexArray[j + 1] != 0) {
            tempTexArray[j + 1] = tempState;           // newColor->endColor.
            tempTexArray[j + 2] = 0;                   // 0->buffColor.
          }
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

  randomizeTimers() {
    for (let i = 0; i < this.texelCount * 4; i += 4) {
      this.texArray[i + 3] = Math.floor(255 * Math.random());
    }
  }

  updateTexture() {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.texWidth, this.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.texArray)
  }

  // Resizes the texArray used by gl.texSubImage2D:
  // Sets a new end point for texArray if the texture shrinks.
  // Copies values using an ArrayBuffer if the texture grows. 
  // TODO: look into copyTexSubImage2D.
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

  // Increments the timer and pops buffColor:
  // Javascript Space->Shader Space:
  // {UI8[0], UI8[1], UI8[2], UI8[3]}->{vec4.r, vec4.g, vec4.b, vec4.a} = 
  // = {startColor, endColor, buffColor, Timer}
  updateAnimations(tempAnimRate) {
    for (let i = 0; i < this.texArray.length; i += 4) {
      // Animation has completed.
      if (this.texArray[i + 2] != 0 && this.texArray[i + 3] >= 255) {
        this.texArray[i] = this.texArray[i + 1];     // endColor->startColor.
        this.texArray[i + 1] = this.texArray[i + 2]; // buffColor->endColor.
        this.texArray[i + 2] = 0;                    // 0->buffColor.
        this.texArray[i + 3] = 0;                    // 0->timer.
      } else {
        this.texArray[i + 3] = 255 * Math.min(Math.max(deltaTime * animRate
          + this.texArray[i + 3] / 255, 0), 1.0);
      }
    }
  }

  // Test animation for showcasing performance:
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
