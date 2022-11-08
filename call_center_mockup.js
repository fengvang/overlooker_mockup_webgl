var mouseX = 0;
var mouseY = 0;
var runTime = 0;
var deltaTime = 0;

// Initialize WebGL:
const gridCanvas = document.getElementById("cgl");
const gl = gridCanvas.getContext("webgl", { cull: false, depth: false, antialias: false });
const programInfoA = twgl.createProgramInfo(gl, ["vertex_screen", "fragment_screen"]); // Compile shaders.
const programInfoB = twgl.createProgramInfo(gl, ["vertex_texture", "fragment_texture"]);

if (gl == null || programInfoA == null || programInfoB == null) {
  throw new Error("WebGL context creation or shader compilation has failed. Your device or browser must be able"
    + " to use WebGL 1.0 to continue.");
}
const glArrays = {
  a_position: [-1.0, -1.0, 0.0, 1.0, -1.0, 0.0, -1.0, 1.0, 0.0,
  -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, 1.0, 1.0, 0.0,
  ],

  a_texcoord: [0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
    0.0, 1.0, 1.0, 0.0, 1.0, 1.0,
  ],
};

const uniforms = {
  u_time: 0, u_mouse: 0, u_timescale: 0,
  u_resolution: 0, u_gridparams: [0, 0, 0], u_colortheme: 0,
  u_texture_data: 0, u_texture_color: 0, u_matrix: 0,
};
const bufferInfo = twgl.createBufferInfoFromArrays(gl, glArrays);
twgl.setBuffersAndAttributes(gl, programInfoA, bufferInfo);
twgl.setBuffersAndAttributes(gl, programInfoB, bufferInfo);

function setup() {
  "use strict";
  let tempLayout, layout, updateRatio;
  let animRate = 0;
  let prevTime = 0;
  tempLayout = "growing"; // Change to test layouts.

  switch (tempLayout) {
    case "growing":
      let startCount = 100;
      let endCount = 100000;
      animRate = 1.5;
      let joinAnimRate = animRate; // How long users must wait to join.
      let joinPerTick = 1; // Don't move off 1 right now.
      updateRatio = 0.015625;
      uniforms.u_colortheme = VisualAux.setColorTheme("random");
      layout = new LayoutUsersJoin(startCount, endCount, joinAnimRate, joinPerTick, updateRatio);
      break;
    default:
      animRate = 3.0; // How fast the color transition finishes.
      let userCount = 10000;
      updateRatio = 0.125 // The ratio of users that can receive a state update per tick.
      uniforms.u_colortheme = VisualAux.setColorTheme("random");
      layout = new LayoutUsersStatic(userCount, updateRatio);
  }

  // Start draw loop:
  function render(time) {
    runTime = time * 0.001;
    deltaTime = runTime - prevTime;
    prevTime = runTime;

    // Resize if needed.
    if (twgl.resizeCanvasToDisplaySize(gl.canvas)) {
      layout.resize();
    }

    layout.display(deltaTime, animRate);
    requestAnimationFrame(render); // Repeat loop.
  }
  layout.updateUniforms();
  deltaTime = 0.0;
  requestAnimationFrame(render); // Start loop.
}

class LayoutSimGrid {
  constructor(tempUserCount) {
    let dotPadding = 0.1;
    this.maxStateQueue = 500000;
    this.gridMain = new UserGrid(tempUserCount, gl.canvas.width, gl.canvas.height, dotPadding, "maxArea");
    this.userSim = new UserSimulator(tempUserCount);
    this.texMain = new DataTexture(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    this.texMain.randomizeTimers();
    this.mouseOver = { index: "uninit", user: 0 };
    this.updateUniforms();

    addEventListener('click', (event) => {
      this.mouseClick();
    });
  }

  updateUniforms() {
    uniforms.u_resolution = [gl.canvas.width, gl.canvas.height];
    uniforms.u_timescale = 3.0;
    uniforms.u_gridparams = [this.texMain.texWidth, this.texMain.texHeight, this.gridMain.parameters.padding];

    // spanHeight, spanWidth, stretch, preserve:
    uniforms.u_matrix = VisualAux.textureStretch(this.texMain.texWidth, this.texMain.texHeight, "stretch");
  }

  resize() {
    this.gridMain.resize(gl.canvas.width, gl.canvas.height);
    this.texMain.updateTextureDimensions(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    this.updateUniforms();
  }

  addColumnsRows(addCount) {
    this.gridMain.addTiles(addCount, gl.canvas.width, gl.canvas.height);
    this.texMain.updateTextureDimensions(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    this.updateUniforms();
  }

  mouseClick() {
    var tempMouseOver = { index: this.gridMain.getMouseOverIndex(), user: 0 };

    if (Number.isInteger(tempMouseOver.index)) {
      tempMouseOver.user = this.userSim.userArray[tempMouseOver.index];
      let tempColor = VisualAux.inverseStatusCode(tempMouseOver.user.currentState, uniforms.u_colortheme);
      console.log('%cuserArray[%s]:', tempColor, tempMouseOver.index, tempMouseOver.user);
    } else {
      console.log("Invalid Target")
    }
  }

  display(tempDeltaTime, tempAnimRate) {
    if (this.userSim.userArray.length > this.gridMain.parameters.activeTiles) {
      let addCount = this.userSim.userArray.length - this.gridMain.parameters.activeTiles;
      this.addColumnsRows(addCount);
    }

    this.userSim.setStateChanges(this.texMain.texArray);
    this.texMain.updateTexture();
    this.texMain.updateAnimations(tempDeltaTime, tempAnimRate);
    this.texMain.display();
  }
}

class LayoutUsersStatic extends LayoutSimGrid {
  constructor(tempUserCount, updateRatio) {
    super(tempUserCount);
    let tickInterval = 25;
    this.userStateProbArray = VisualAux.createProbabilityArray(0.2, 0.05, Object.keys(this.userSim.stateCodes).length - 1);

    // Start the UserSim clock:
    this.clientClock = setInterval(() => {
      var updatesPerTick = this.userSim.userArray.length * updateRatio;
      
      for (let i = 0; i < updatesPerTick; i++) {
        var lowerBound = 0;
        var upperBound = 0;

        // Select a random index using distribution, if invalid use random directly:
        var tempStateIndex = VisualAux.processProbabilityArray(this.userStateProbArray);
        if (tempStateIndex == null) {
          tempStateIndex = Math.floor(2.51 + 2.5 * Math.random());
        }

        var [stateName, stateCode] = Object.entries(this.userSim.stateCodes)[tempStateIndex]; // Use random index to get a stateCode.
        
        // Check to make sure there isn't only one user:
        // BUG: desync after grid resize can cause this check to fail. Need callback/promise.
        if (this.userSim.userArray.length == 1) {
          upperBound = 1;
        } else {
          upperBound = this.userSim.userArray.length - 1;
        }
        this.userSim.setStateRandomUser(stateCode, stateName, lowerBound, upperBound);
      }

      if (this.userSim.stateUpdateQueue.length >= this.maxStateQueue) {
        this.userSim.setStateChanges(this.texMain.gridArray); // The draw loop doesn't run while minimized, so use the clock to dequeue instead.
      }
    }, tickInterval);
  }
}

class LayoutUsersJoin extends LayoutSimGrid {
  constructor(startCount, endCount, simAnimRate, joinPerTick, updateRatio) {
    super(startCount);

    // Priming clock loop:
    this.userStateProbArray = VisualAux.createProbabilityArray(0.2, 0.05, Object.keys(this.userSim.stateCodes).length - 1);
    let tickInterval = 25;
    let lastAnimationTime = 0;
    let simDeltaTime = 0;
    let simPrevTime = 0;

    // State update clock:
    this.clientClock = setInterval(() => {
      var updatesPerTick = this.userSim.userArray.length * updateRatio;
      simDeltaTime = runTime - simPrevTime;
      simPrevTime = runTime;

      for (let i = 0; i < updatesPerTick; i++) {
        var lowerBound = 0;
        var upperBound = 0;
        
        // Select a random index using distribution, if invalid use random directly:
        // BUG: desync after grid resize can cause this check to fail. Need callback/promise.
        var tempStateIndex = VisualAux.processProbabilityArray(this.userStateProbArray);
        if (tempStateIndex == null) {
          tempStateIndex = Math.floor(2.51 + 2.5 * Math.random());
        }

        var [stateName, stateCode] = Object.entries(this.userSim.stateCodes)[tempStateIndex]; // Use random index to get a state.
        
        // Check to make sure it's safe to limit updates to above the lowest line:
        if (this.userSim.userArray.length == 1) {
          upperBound = 1;
        }
        else if (this.gridMain.parameters.rows == 1) {
          upperBound = this.userSim.userArray.length - 1;
        } else {
          let tempUpperBound = this.gridMain.parameters.columns * (this.gridMain.parameters.rows - 1);
          var upperBound = VisualAux.constrain(0, this.userSim.userArray.length - 1, tempUpperBound);
        }
        this.userSim.setStateRandomUser(stateCode, stateName, lowerBound, upperBound);
      }

      if (lastAnimationTime >= 1.0) {
        for (let i = 0; i < joinPerTick; i++) {
          var [stateName, stateCode] = Object.entries(this.userSim.stateCodes)[3];
          this.userSim.userJoin(stateCode, stateName);
        }
        lastAnimationTime = 0;
      } else {
        lastAnimationTime += simDeltaTime * simAnimRate;
      }

      // Reset grid once max user count has been reached.
      if (this.userSim.userArray.length > endCount) {
        let tempDotPadding = this.gridMain.parameters.padding;
        this.gridMain = null;
        this.texMain = null;
        this.gridMain = new UserGrid(startCount, gl.canvas.width, gl.canvas.height, tempDotPadding, "maxArea");
        this.texMain = new DataTexture(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
        this.texMain.randomizeTimers();
        this.userSim = new UserSimulator(startCount);
        lastAnimationTime = 0;
      }

      if (this.userSim.stateUpdateQueue.length >= this.maxStateQueue) {
        this.userSim.setStateChanges(this.texMain.texArray); // The draw loop doesn't run while minimized, so use the clock to dequeue instead.
      }
    }, tickInterval);
  }
}

class UserSimulator {
  constructor(tempUserCount) {
    this.userArray = [];
    this.stateUpdateQueue = [];
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

    this.initUserArrayRandom(tempUserCount);
  }

  initUserArray(tempUserCount) {
    for (let i = 0; i < tempUserCount; i++) {
      this.userJoin();
    }
  }

  initUserArrayRandom(tempUserCount) {
    let tempLength = Object.keys(this.stateCodes).length - 1;

    for (let i = 0; i < tempUserCount; i++) {
      let tempStateIndex = Math.floor(Math.random() * tempLength + 0.5);
      var [tempStateName, tempStateCode] = Object.entries(this.stateCodes)[tempStateIndex];
      this.userJoin(tempStateCode, tempStateName);
    }
  }

  userJoin(initialState, tempStateName) {
    if (initialState == null) {
      [tempStateName, initialState] = Object.entries(this.stateCodes)[5];
    }

    this.userArray.push({
      userID: (Math.random() + 1).toString(36).substring(7),
      currentState: initialState,
      stateName: tempStateName,
      connectionTime: Math.floor(Date.now() * 0.001), // In epoch time.
      connectionStatus: "online",
    });
    let userIndex = this.userArray.length - 1;
    this.pushStateChange(this.getTextureIndex(userIndex), initialState);
    this.stateChangeCounter++;
  }

  userLeave(tempIndex) {
    let offlineCode = this.stateCodes.loggedOut;
    this.userArray[tempIndex].connectionStatus = "offline";
    this.pushStateChange(this.getTextureIndex(tempIndex), offlineCode);
    this.userArray[tempIndex].currentState = offlineCode;
  }

  setStateUser(userIndex, stateCode, stateName) {
    this.userArray[userIndex].currentState = stateCode;
    this.userArray[userIndex].stateName = stateName;
    this.pushStateChange(this.getTextureIndex(userIndex), stateCode);
    this.stateChangeCounter++;
  }

  // Use random noise function to select a user/texel/dot:
  setStateRandomUser(stateCode, stateName, lowerBound, upperBound) {
    if (upperBound == null || lowerBound == null) {
      lowerBound = 0;
      upperBound = this.userArray.length - 1;
    }
    var offset = this.stateChangeCounter / upperBound;
    var userIndex = Math.floor(VisualAux.sineNoise(lowerBound, upperBound, 1, offset, offset));

    this.setStateUser(userIndex, stateCode, stateName);
  }

  // Maps user ID/index onto the texture:
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

class DataTexture {
  constructor(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.texArray = new Uint8Array(tempWidth * tempHeight * 4 + 4);
    this.colorTexture = this.createTexture(tempWidth, tempHeight);
    this.dataTexture = this.createTexture(tempWidth, tempHeight);
    this.initFramebuffer();
    uniforms.u_texture_color = this.colorTexture;
    uniforms.u_texture_data = this.dataTexture;
  }

  createTexture(tempWidth, tempHeight) {
    let tempTexture = twgl.createTexture(gl, {
      target: gl.TEXTURE_2D,
      width: tempWidth,
      height: tempHeight,
      format: gl.RGBA,
      min: gl.NEAREST,
      mag: gl.NEAREST,
      wrap: gl.CLAMP_TO_EDGE,
    });
    return tempTexture;
  }

  initFramebuffer() {
    this.bufferAttachments = [{
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      min: gl.NEAREST,
      mag: gl.NEAREST,
      wrap: gl.CLAMP_TO_EDGE,
      attachment: this.colorTexture,
    }];
    this.stageBufferInfo = twgl.createFramebufferInfo(gl, this.bufferAttachments, this.texWidth, this.texHeight);
  }

  randomizeTimers() {
    for (let i = 0; i < this.texArray.length; i += 4) {
      this.texArray[i + 3] = Math.floor(255 * Math.random());
    }
  }

  updateTexture() {
    let options = {
      target: gl.TEXTURE_2D,
      width: this.texWidth,
      height: this.texHeight,
      format: gl.RGBA,
      min: gl.NEAREST,
      mag: gl.NEAREST,
      wrap: gl.CLAMP_TO_EDGE,
    };
    twgl.setTextureFromArray(gl, this.dataTexture, this.texArray, options);
  }

  display() {
    twgl.resizeFramebufferInfo(gl, this.stageBufferInfo, this.bufferAttachments, this.texWidth, this.texHeight);

    // Use the first fragment shader.
    gl.useProgram(programInfoB.program);
    twgl.setUniforms(programInfoB, uniforms);
    twgl.bindFramebufferInfo(gl, this.stageBufferInfo);
    twgl.drawBufferInfo(gl, bufferInfo);

    twgl.bindFramebufferInfo(gl, null);

    // Use the second fragment shader.
    gl.useProgram(programInfoA.program);
    twgl.setUniforms(programInfoA, uniforms);
    twgl.drawBufferInfo(gl, bufferInfo);
  }

  // Resizes the texArray:
  // Sets a new end point for texArray if the texture shrinks.
  // Copies values using an ArrayBuffer if the texture grows. 
  updateTextureDimensions(tempWidth, tempHeight) {
    var tempArrayLength = tempWidth * tempHeight * 4 + 4;
    if (this.texArray.length > tempArrayLength) {
      this.texArray = this.texArray.subarray(0, tempArrayLength);
    } else {
      let tempBuffer = new ArrayBuffer(tempArrayLength);
      new Uint8Array(tempBuffer).set(new Uint8Array(this.texArray));
      this.texArray = new Uint8Array(tempBuffer);
    }
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
  }

  // Increments the timer and pops buffColor:
  // Javascript Space->Shader Space:
  // {UI8[0], UI8[1], UI8[2], UI8[3]}->{vec4.r, vec4.g, vec4.b, vec4.a} = 
  // = {startColor, endColor, buffColor, Timer}
  updateAnimations(tempDeltaTime, tempAnimRate) {
    for (let i = 0; i < this.texArray.length; i += 4) {
      // Animation has completed.
      if (this.texArray[i + 2] != 0 && this.texArray[i + 3] >= 255) {
        this.texArray[i] = this.texArray[i + 1];     // endColor->startColor.
        this.texArray[i + 1] = this.texArray[i + 2]; // buffColor->endColor.
        this.texArray[i + 2] = 0;                    // 0->buffColor.
        this.texArray[i + 3] = 0;                    // 0->timer.
      } else {
        this.texArray[i + 3] = 255 * Math.min(Math.max(tempDeltaTime * tempAnimRate
          + this.texArray[i + 3] / 255, 0), 1.0);
      }
    }
  }
}

class UserGrid {
  constructor(tempActiveTiles, canvasWidth, canvasHeight, tempPadding, tempSpanMode) {
    this.parameters = {
      activeTiles: tempActiveTiles, tileSize: 0, width: 0, height: 0, rows: 0, columns: 0,
      capacity: 0, padding: tempPadding, marginX: 0, marginY: 0, spanMode: tempSpanMode
    };
    this.updateTiling(tempSpanMode, canvasWidth, canvasHeight);
  }

  addTiles(tempCountToAdd, tempWidth, tempHeight) {
    let newActiveTiles = this.parameters.activeTiles + tempCountToAdd;
    if (newActiveTiles > this.parameters.capacity) {
      this.parameters.activeTiles += tempCountToAdd;
      this.updateTiling(this.parameters.spanMode, tempWidth, tempHeight);
    } else if (newActiveTiles > this.parameters.activeTiles) {
      this.parameters.activeTiles += tempCountToAdd;
    } else {
      console.log("UserGrid.addTiles: tempCountToAdd <= 0.")
    }
  }

  resize(tempWidth, tempHeight) {
    this.updateTiling(this.parameters.spanMode, tempWidth, tempHeight);
  }

  updateTiling(tempSpanMode, tempWidth, tempHeight) {
    let paramsHeight, paramsWidth;
    switch (tempSpanMode) {
      case "spanWidth":
        paramsWidth = this.tilingSpanWidth(tempWidth, tempHeight);
        Object.assign(this.parameters, paramsWidth);
        break;
      case "spanHeight":
        paramsHeight = this.tilingSpanHeight(tempWidth, tempHeight);
        Object.assign(this.parameters, paramsHeight);
        break;
      case "maxTiles":
        paramsWidth = this.tilingSpanWidth(tempWidth, tempHeight);
        paramsHeight = this.tilingSpanHeight(tempWidth, tempHeight);
        if (paramsWidth.capacity > paramsHeight.capacity) {
          Object.assign(this.parameters, paramsWidth);
        } else {
          Object.assign(this.parameters, paramsHeight);
        }
        break;
      case "maxArea":
        paramsWidth = this.tilingSpanWidth(tempWidth, tempHeight);
        paramsHeight = this.tilingSpanHeight(tempWidth, tempHeight);
        if (paramsWidth.tileSize > paramsHeight.tileSize) {
          Object.assign(this.parameters, paramsHeight);
        } else {
          Object.assign(this.parameters, paramsWidth);
        }
        break;
      default:
        console.log("Invalid tiling spanMode!");
    }
    this.parameters.marginX = (tempWidth - this.parameters.width) / 2;
    this.parameters.marginY = (tempHeight - this.parameters.height) / 2;
  }

  tilingSpanWidth(canvasWidth, canvasHeight) {
    let windowRatio = canvasWidth / canvasHeight;
    let cellWidth = Math.sqrt(this.parameters.activeTiles * windowRatio);

    let columnsW = Math.ceil(cellWidth);
    let rowsW = Math.ceil(this.parameters.activeTiles / columnsW);
    while (columnsW < rowsW * windowRatio) {
      columnsW++;
      rowsW = Math.ceil(this.parameters.activeTiles / columnsW);
    }
    let tileSizeW = canvasWidth / columnsW;

    let tempParameters = {
      rows: rowsW, columns: columnsW,
      tileSize: tileSizeW, width: canvasWidth,
      height: rowsW * tileSizeW, capacity: rowsW * columnsW,
    }
    return tempParameters;
  }

  tilingSpanHeight(canvasWidth, canvasHeight) {
    let windowRatio = canvasWidth / canvasHeight;
    let cellWidth = Math.sqrt(this.parameters.activeTiles * windowRatio);
    let cellHeight = this.parameters.activeTiles / cellWidth;

    let rowsH = Math.ceil(cellHeight);
    let columnsH = Math.ceil(this.parameters.activeTiles / rowsH);
    while (rowsH * windowRatio < columnsH) {
      rowsH++;
      columnsH = Math.ceil(this.parameters.activeTiles / rowsH);
    }
    let tileSizeH = canvasHeight / rowsH;

    let tempParameters = {
      rows: rowsH, columns: columnsH,
      tileSize: tileSizeH, width: columnsH * tileSizeH,
      height: canvasHeight, capacity: rowsH * columnsH,
    }
    return tempParameters;
  }

  // Finds the index of the dot underneath the mouse:
  // Treats dots as circular if there are less than 1000.
  getMouseOverIndex() {
    let inverseScanX = Math.floor((mouseX - this.parameters.marginX) / this.parameters.tileSize);
    let inverseScanY = Math.floor((mouseY - this.parameters.marginY) / this.parameters.tileSize);
    let tempMouseOverIndex = inverseScanX + inverseScanY * this.parameters.columns;
    let mouseOverIndex = 0;

    if (inverseScanX < 0 || this.parameters.columns <= inverseScanX || inverseScanY < 0 || this.parameters.activeTiles <= tempMouseOverIndex) {
      mouseOverIndex = "UDF";
    } else if (this.parameters.capacity < 1000) {
      let originX = 0;
      let originY = 0;
      let dotRadius = this.parameters.tileSize * (1 - this.parameters.padding) / 2;
      let scanX = originX + this.parameters.marginX + this.parameters.tileSize / 2 + inverseScanX * this.parameters.tileSize;
      let scanY = originY + this.parameters.marginY + this.parameters.tileSize / 2 + inverseScanY * this.parameters.tileSize;
      let centerDistance = Math.sqrt(Math.pow(mouseX + originX - scanX, 2) + Math.pow(mouseY + originY - scanY, 2));
      if (centerDistance > dotRadius) {
        mouseOverIndex = "MISS";
      } else {
        mouseOverIndex = inverseScanX + inverseScanY * this.parameters.columns;
      }
    } else {
      mouseOverIndex = inverseScanX + inverseScanY * this.parameters.columns;
    }
    return mouseOverIndex;
  }
}

class VisualAux {

  static setColorTheme(themeSelection) {
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

  static inverseStatusCode(tempCode, tempColorTheme) {
    let tempColor;
    let tempColorArray = [];

    switch (tempCode) {
      case 0:
        tempColorArray = tempColorTheme.slice(20, 23);
        break;
      case 51:
        tempColorArray = tempColorTheme.slice(0, 3);
        break;
      case 102:
        tempColorArray = tempColorTheme.slice(4, 7);
        break;
      case 153:
        tempColorArray = tempColorTheme.slice(8, 11);
        break;
      case 204:
        tempColorArray = tempColorTheme.slice(12, 15);
        break;
      case 255:
        tempColorArray = tempColorTheme.slice(16, 19);
        break;
    }
    tempColor = "font-weight: bold; background-color: rgb(" + 255 * tempColorArray[0] + ","
      + 255 * tempColorArray[1] + "," + 255 * tempColorArray[2] + ");";

    return tempColor;
  }

  static textureStretch(tempWidth, tempHeight, tempScaleType) {
    const canvasAspectRatio = gl.canvas.width / gl.canvas.height;
    const textureAspectRatio = tempWidth / tempHeight;
    let scaleX, scaleY;
    let scaleType = tempScaleType;
    switch (scaleType) {
      case 'spanHeight':
        scaleY = 1;
        scaleX = textureAspectRatio / canvasAspectRatio;
        break;
      case 'spanWidth':
        scaleX = 1;
        scaleY = canvasAspectRatio / textureAspectRatio;
        break;
      case 'stretch':
        scaleY = 1;
        scaleX = textureAspectRatio / canvasAspectRatio;
        if (scaleX > 1) {
          scaleY = 1 / scaleX;
          scaleX = 1;
        }
        break;
      case 'preserve':
        scaleY = 1;
        scaleX = textureAspectRatio / canvasAspectRatio;
        if (scaleX < 1) {
          scaleY = 1 / scaleX;
          scaleX = 1;
        }
        break;
    }

    let matrix = [
      scaleX, 0.0, 0.0,
      0.0, -scaleY, 0.0,
      0.0, 0.0, 1.0,
    ]

    return matrix;
  }

  static constrain(lowerBound, upperBound, tempValue) {
    let constrained = Math.min(Math.max(tempValue, lowerBound), upperBound);
    return constrained;
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
    return rollIterations;
  }
}

gridCanvas.addEventListener('mousemove', (e) => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;
});

setup();
