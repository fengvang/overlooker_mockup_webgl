var gl, gridCanvas, canvasResized;
var gridMain, gridSearch, texMain, texSearch, userSim;
var programInfo, bufferInfo;
var colorTheme, mouseX, mouseY, prevTime, runTime, animRate;

function setupLayout(tempLayout) {

  let tempUserCount, dotPadding, simTickRate, theme;
  gridCanvas = document.getElementById("cgl");
  initWebGL();

  // Choose from layouts:
  switch (tempLayout) {
    default:
      theme = "default";
      animRate = 3.0;
      tempUserCount = 10000;
      dotPadding = 0.1;
      simTickRate = 25;
      upPerTick = tempUserCount / 8;
      maxStateQueue = upPerTick * 4;
  }

  // Init variables:
  gridMain = new UserGrid(tempUserCount, gridCanvas.width, gridCanvas.height, dotPadding);
  userSim = new UserSimulator(tempUserCount, maxStateQueue);
  texMain = new DataTexture(gridMain.gridColumns, gridMain.gridRows);
  userSim.updatesPerTick = upPerTick;
  colorTheme = setColorTheme(theme);

  // Used to have some control over distribution of events like dot color and join/leave.
  // TODO: come up with something that isn't so messy.
  userStateProbArray = VisualAux.createProbabilityArray(0.2, 0.05, Object.keys(this.userSim.stateCodes).length - 1);
  //userLeaveProbArray = VisualAux.createProbabilityArray(0.01, 0.005, this.userSim.userCount - 1);

  // State update clock:
  clientTimer = setInterval(function () {
    for (let i = 0; i < upPerTick; i++) {

      // Set individual user state: 
      var tempStateIndex = VisualAux.processProbabilityArray(userStateProbArray);
      var tempState = Object.values(userSim.stateCodes)[tempStateIndex]; // Use random index to get a stateCode.
      if (tempState != null) {
        userSim.setRandomState(tempState);
      }

      // Predict if a user joins.
      var joinChance = 0.001;
      var leaveChance = 0.0005;
      if (Math.random() < joinChance) {
        userSim.userJoin();
      } else if (Math.random() < leaveChance) {
        let userIndex = Math.floor(VisualAux.sineNoise(0, userSim.userArray.length - 1, 1, 1, 1));
        userSim.userLeave(userIndex);
      }
    }
    // The draw loop doesn't run while minimized, so use the clock instead.
    if (userSim.stateUpdateQueue.length >= maxStateQueue) {
      userSim.setStateChanges(texMain);
    }

    if (userSim.userCount != gridMain.dotCount) {
      gridMain.addTiles(userSim.userCount);
      texMain.updateTextureDimensions(gridMain.gridColumns, gridMain.gridRows);
    }
  }, simTickRate);

  function initWebGL() {
    gl = gridCanvas.getContext("webgl", { alpha: false, antialias: false });
    programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]); // Compile shaders.
    const arrays = {
      a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 1], // Simple quad.
      a_texcoord: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1],
    };
    bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
  }

  // Main draw loop:
  requestAnimationFrame(render);
  function render(time) {
    runTime = time * 0.001;
    deltaTime = runTime - prevTime;
    prevTime = runTime;

    function drawLayout(tempLayout) {
      switch (tempLayout) {
        default:
        // Layout specific draw loop code goes here.
      }
      userSim.setStateChanges(texMain.texArray);
      texMain.updateTexture();
      texMain.updateAnimations(animRate);
    }; drawLayout(myLayout);

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(programInfo.program);
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);

    function updateUniformsFrequent(time) {
      uniformsFrequent = {
        u_time: time,
        u_mouse: [mouseX, mouseY],
      }; twgl.setUniforms(programInfo, uniformsFrequent);
    }; updateUniformsFrequent(deltaTime);

    function updateUniformsInfrequent() {
      uniformsInfrequent = {
        u_timescale: animRate,
        u_resolution: [gridCanvas.width, gridCanvas.height],
        u_gridparams: [gridMain.gridColumns, gridMain.gridRows, gridMain.dotPadding],
        u_colortheme: colorTheme,
      }; twgl.setUniforms(programInfo, uniformsInfrequent);
    }; updateUniformsInfrequent(); // Couldn't separate this out yet.

    twgl.drawBufferInfo(gl, bufferInfo);
    requestAnimationFrame(render); // Repeat loop.
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
  canvasResized = document.querySelector("body");
  myObserver.observe(canvasResized);
}

// Theme selection:
function setColorTheme(themeSelection) {
  let colorOnCall, colorAvailable, colorPreviewingTask,
    colorAfterCall, colorLoggedOut, colorBackground, backGroundIndex;
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
    default:
      colorBackground = [11, 10, 17, 255]; // Normally [0, 0, 0, 255]
      colorOnCall = [243, 108, 82, 255];
      colorAvailable = [63, 191, 177, 255];
      colorPreviewingTask = [0, 110, 184, 255];
      colorAfterCall = [255, 205, 52, 255];
      colorLoggedOut = [11, 10, 17, 255]; // Normally [0, 48, 70, 255]
      break;
  }

  if (themeSelection != "random") {
    tempColorTheme = [].concat(colorLoggedOut, colorAfterCall, colorPreviewingTask,
      colorAvailable, colorOnCall, colorBackground);
  }

  backGroundIndex = tempColorTheme.length - 1;
  document.body.style.backgroundColor = "rgb(" + tempColorTheme[backGroundIndex - 3] + ","
    + tempColorTheme[backGroundIndex - 2] + "," + tempColorTheme[backGroundIndex - 1] + ")";

  // Normalize values for the shader.
  for (let i = 0; i < tempColorTheme.length; i++) {
    tempColorTheme[i] = tempColorTheme[i] / 255;
  }
  return tempColorTheme;
}

class UserSimulator {
  constructor(tempUserCount, tempMaxStateQueue) {
    this.userCount = 0;
    this.userArray = [];
    this.updatesPerTick = 0;
    this.stateUpdateQueue = [];
    this.maxStateQueue = tempMaxStateQueue;
    this.stateChangeCounter = 0;

    // Javascript Space->Shader Space:
    // {0, 51, 102, 153, 204, 255}->{0.0, 0.2, 0.4, 0.6, 0.8, 1.0} 
    this.stateCodes = {
      loggedOut: 255,
      afterCall: 204,
      previewingTask: 153,
      available: 102,
      onCall: 51,
      neverInitialized: 0,
    };

    this.eventCodes = {
    };

    this.initUserArray(tempUserCount);
  }

  initUserArray(tempUserCount) {
    for (let i = 0; i < tempUserCount; i++) {
      this.userJoin();
    }
  }

  userJoin() {
    let uninitCode = this.stateCodes.neverInitialized;

    this.userArray.push({
      userID: (Math.random() + 1).toString(36).substring(7),
      currentState: uninitCode,
      connectionTime: Math.floor(Date.now() * 0.001), // In epoch time.
      connectionStatus: "online",
    });
    let lastIndex = this.userArray[this.userArray.length - 1];
    this.pushStateChange(this.getTextureIndex(lastIndex), uninitCode);
    this.userCount++;
  }

  userLeave(tempIndex) {
    let offlineCode = this.stateCodes.loggedOut;
    this.userArray[tempIndex].connectionStatus = "offline";
    this.pushStateChange(this.getTextureIndex(tempIndex), offlineCode);
    this.userArray[tempIndex].currentState = offlineCode;
  }

  // Enqueues a number of state changes each tick:
  setRandomState(stateCode) {
    // Use random noise function to select a user/texel/dot:
    var offset = this.stateChangeCounter / this.userCount;
    var userIndex = Math.floor(VisualAux.sineNoise(0, this.userCount - 1, 1, offset, offset));

    if (this.userArray[userIndex].connectionStatus == "online") {
      this.userArray[userIndex].currentState = stateCode;
      this.pushStateChange(this.getTextureIndex(userIndex), stateCode);
      this.stateChangeCounter++;
    }
  }

  // Maps user ID/index onto the texture (need something more for persistance later):
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

  // No time right now. The idea is to compare states in the queue with
  // the same textureIndex and discard everything but the most recent.
  overwriteRedundantStates() {
    this.stateUpdateQueue = []; // Draw doesn't run to clear the queue while minimized.
  }
}

class VisualAux {

  static sineNoise(lowerBound, upperBound, timeScale, inputA, inputB) {
    let noiseTimer = performance.now() * timeScale;
    return Math.min(Math.max(upperBound * (0.5 + 0.255 * (Math.sin(2 * inputA * noiseTimer) + Math.sin(Math.PI * inputB * noiseTimer))), lowerBound), upperBound);
  }

  static createProbabilityArray(mean, deviation, arrayLength) {
    let tempArray = [];
    for (let i = 0; i < arrayLength; i++) {
      tempArray.push(Math.min(Math.max((mean + deviation * Math.sin(2 * Math.PI * Math.random())), 0), 1));
    }
    tempArray.sort((a, b) => a + b);
    return tempArray;
  }

  static processProbabilityArray(tempArray) {
    var rollIterations = null;
    var counter;
    for (counter = 0; counter < tempArray.length; counter++) {
      if (Math.random() < tempArray[counter]) {
        rollIterations = counter;
        break;
      }
    }
    //if (counter > 0 && rollIterations == 0) {
    //  rollIterations = Math.floor(tempArray.length * Math.random() + 0.5);
    //}
    return rollIterations;
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
        this.texArray[i + 3] = 255 * Math.min(Math.max(deltaTime * tempAnimRate
          + this.texArray[i + 3] / 255, 0), 1.0);
      }
    }
  }
}

class UserGrid {
  constructor(tempDotCount, canvasWidth, canvasHeight, tempPadding) {
    this.dotCount = tempDotCount;
    this.dotPadding = tempPadding;
    this.gridWidth = 0;
    this.gridHeight = 0;
    this.gridMarginX = 0;
    this.gridMarginY = 0;
    this.gridRows = 0;
    this.gridColumns = 0;
    this.tileSize = 0;
    this.updateTilingMaxSpan(canvasWidth, canvasHeight);
  }

  addTiles(tempTileCount) {
    let gridCapacity = this.gridColumns * this.gridRows;
    if (tempTileCount > gridCapacity) {
      this.dotCount = tempTileCount;
      this.updateTilingMaxSpan(gridCanvas.width, gridCanvas.height);
    } else if (tempTileCount > this.dotCount) {
      this.dotCount = tempTileCount;
    } else {
      console.log("UserGrid.addTiles: this.tileCount > tempTileCount.")
    }
  }

  removeTiles(tempTileCount) {
    let lowerBoundCapacity = this.gridColumns * (this.gridRows - 1);
    if (tempTileCount <= lowerBoundCapacity) {
      this.dotCount = tempTileCount;
      this.updateTilingMaxSpan(gridCanvas.width, gridCanvas.height);
    }
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

const myLayout = "default";
setupLayout(myLayout);
