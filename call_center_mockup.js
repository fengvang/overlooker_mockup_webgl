var [mouseX, mouseY, runTime, deltaTime, dotColorTimer] = [0, 0, 0, 0, 0];
var consoleBool = 0;

// Initialize WebGL:
const gridCanvas = document.getElementById("cgl");
const gl = gridCanvas.getContext("webgl", { cull: false, antialias: false });
const programInfoA = twgl.createProgramInfo(gl, ["vertex_screen", "fragment_screen"]); // Compile shaders.
const programInfoB = twgl.createProgramInfo(gl, ["vertex_texture", "fragment_texture"]);

if (gl == null || programInfoA == null || programInfoB == null) {
  throw new Error("WebGL context creation has failed. Your device or browser must be able"
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
  u_time: 0, u_mouse: [0, 0,], u_interval: 0,
  u_resolution: [0, 0,], u_gridparams: [0, 0, 0,], u_colortheme: 0,
  u_texture_data: 0, u_texture_color: 0, u_matrix: 0,
};
const bufferInfo = twgl.createBufferInfoFromArrays(gl, glArrays);
twgl.setBuffersAndAttributes(gl, programInfoA, bufferInfo);
twgl.setBuffersAndAttributes(gl, programInfoB, bufferInfo);

function setup() {
  "use strict";
  let [layout, prevTime, initBlock] = [0, 0, 0];

  // Set test layout here:
  let tempLayout = "";

  switch (tempLayout) {
    case "growing":
      initBlock = {
        simBehavior: "addUsers",
        tickInterval: 25,
        startCount: 1000,
        endCount: 3000000,
        animInterval: 10,
        joinAnimInterval: 10, // Affects how long users must wait to join.
        joinPerTick: 10000,
        updateRatio: 0.125,
        maxStateQueue: 500000,
        themeSelection: "random",
        dotPadding: 0.15,
        tilingSpanMode: "maxArea",
      }
      layout = new LayoutSimGrid(initBlock);
      break;
    default:
      initBlock = {
        simBehavior: "staticUsers",
        tickInterval: 25,          // Time in millis between simulator ticks.
        startCount: 10000,
        animInterval: 10,
        updateRatio: 0.125,        // The ratio of users that can receive a state update per tick.
        maxStateQueue: 500000,     // The max future state writes before a dequeue is forced.
        themeSelection: "random",
        dotPadding: 0.0,
        tilingSpanMode: "maxArea", // spanWidth, spanHeight, maxArea, maxTiles
      }
      layout = new LayoutSimGrid(initBlock);
  }
  uniforms.u_interval = initBlock.animInterval;
  layout.updateUniforms();
  requestAnimationFrame(render); // Start draw loop.

  function render(time) {
    timers(time);

    if (twgl.resizeCanvasToDisplaySize(gl.canvas)) {
      layout.resize();
    }

    layout.display(initBlock.animInterval);
    requestAnimationFrame(render); // Repeat loop.
  }

  function timers(time) {
    runTime = time * 0.001;
    dotColorTimer = time * 0.02;
    deltaTime = runTime - prevTime;
    prevTime = runTime;
    uniforms.u_time = (dotColorTimer) % 255;
  }
}

class LayoutUserGrid {
  constructor(tempInitBlock) {
    const initBlock = tempInitBlock;
    this.gridMain = new UserGrid(initBlock.startCount, gl.canvas.width, gl.canvas.height, initBlock.dotPadding, initBlock.tilingSpanMode);
    this.userSim = new UserSimulator(initBlock.startCount);
    this.texMain = new DataTexture(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    this.layoutTheme = new ColorTheme(initBlock.themeSelection);
    this.userStateProbArray = VisualAux.createProbabilityArray(0.2, 0.05, Object.keys(this.userSim.stateCodes).length - 1);
    this.mouseOver = { index: "uninit", user: 0, };

    // Mouse click listener:
    addEventListener('click', (event) => {
      this.mouseClick();
    });
  }

  updateUniforms() {
    uniforms.u_resolution = [gl.canvas.width, gl.canvas.height];
    uniforms.u_gridparams = [this.texMain.texWidth, this.texMain.texHeight, this.gridMain.parameters.padding];
    uniforms.u_colortheme = this.layoutTheme.theme;

    // spanHeight, spanWidth, preserve, stretch:
    uniforms.u_matrix = VisualAux.scaleFragCoords(this.texMain.texWidth, this.texMain.texHeight, "preserve");
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
      let tempColor = 'font-weight: bold; background-color: ' + (this.layoutTheme.inverseStatusCode(tempMouseOver.user.currentState));
      console.log('%cuserArray[%s]:', tempColor, tempMouseOver.index, tempMouseOver.user);
    } else {
      console.log("Offscreen or missed!");
    }
  }

  resetGrid(startCount) {
    let [dotPadding, spanMode] = [this.gridMain.parameters.padding, this.gridMain.parameters.spanMode];
    [this.gridMain, this.userSim] = [null, null];
    this.gridMain = new UserGrid(startCount, gl.canvas.width, gl.canvas.height, dotPadding, spanMode);
    this.userSim = new UserSimulator(startCount);
  }

  display(tempAnimInterval) {
    if (this.userSim.userArray.length > this.gridMain.parameters.activeTiles) {
      let addCount = this.userSim.userArray.length - this.gridMain.parameters.activeTiles;
      this.addColumnsRows(addCount);
    }
    this.texMain.updateTexture();
    this.userSim.dequeueNewStates(this.texMain.texArray);
    this.texMain.updateAnimations(tempAnimInterval);
    this.texMain.display(tempAnimInterval);
  }

  getRandomState() {
    var tempStateIndex = null;
    for (let i = 0; i < 5; i++) {
      // Math.random() gives nicer looking distribution than randomFast().
      if (Math.random() < this.userStateProbArray[i]) {
        tempStateIndex = i;
        break;
      }
    }
    if (tempStateIndex == null) {
      tempStateIndex = (4 * Math.random() + 1) >> 0; // float >> 0 is like Math.floor.
    }
    // Ordered by most desired.
    let validCodes = {
      onCall: 153,
      available: 51,
      previewingTask: 102,
      afterCall: 204,
      loggedOut: 255,
    };

    var [tempName, tempCode] = Object.entries(validCodes)[tempStateIndex];
    var stateObject = { stateCode: tempCode, stateName: tempName };
    return stateObject;
  }

  simSetUserAboveBotLine(tempUpdatesPerTick) {
    for (let i = 0; i < tempUpdatesPerTick; i++) {
      var [lowerIndex, upperIndex] = [0, 0];
      let stateObject = this.getRandomState();

      if (this.userSim.userArray.length == 1) {
        upperIndex = 1;
      } else if (this.gridMain.parameters.rows == 1) {
        upperIndex = this.userSim.userArray.length - 1;
      } else {
        upperIndex = this.gridMain.parameters.columns * (this.gridMain.parameters.rows - 1);
      }

      this.userSim.setStateRandomUser(stateObject.stateCode, stateObject.stateName, lowerIndex, upperIndex);
    }
  }

  simSetAnyUser(tempUpdatesPerTick) {
    for (let i = 0; i < tempUpdatesPerTick; i++) {
      var lowerIndex = 0;
      var stateObject = this.getRandomState();
      var upperIndex = this.userSim.userArray.length - 1;
      this.userSim.setStateRandomUser(stateObject.stateCode, stateObject.stateName, lowerIndex, upperIndex);
    }
  }

  simUserJoin(joinPerTick) {
    for (let i = 0; i < joinPerTick; i++) {
      let stateObject = this.getRandomState();
      this.userSim.userJoin(stateObject.stateCode, stateObject.stateName);
    }
  }
}

class LayoutSimGrid extends LayoutUserGrid {
  constructor(tempInitBlock) {
    super(tempInitBlock);
    const initBlock = tempInitBlock;
    let [lastAnimationTime, simDeltaTime, simPrevTime] = [0, 0, 0];

    // State update clock:
    this.clientClock = setInterval(() => {
      var updatesPerTick = this.userSim.userArray.length * initBlock.updateRatio;
      simDeltaTime = runTime - simPrevTime;
      simPrevTime = runTime;

      // Users join for this layout:
      if (initBlock.simBehavior == "addUsers") {
        this.simSetUserAboveBotLine(updatesPerTick);

        if (lastAnimationTime >= 1.0) {
          this.simUserJoin(initBlock.joinPerTick);
          lastAnimationTime = 0;
        } else {
          lastAnimationTime += simDeltaTime * initBlock.joinAnimInterval;
        }

        if (this.userSim.userArray.length > initBlock.endCount) {
          this.resetGrid(initBlock.startCount);
          lastAnimationTime = 0;
        }

        // The user count is fixed for this layout:
      } else if (initBlock.simBehavior == "staticUsers") {
        this.simSetAnyUser(updatesPerTick);
      }

      if (this.userSim.stateQueueCounter >= initBlock.maxStateQueue) {
        this.userSim.dequeueNewStates(this.texMain.texArray); // The draw loop doesn't run while minimized, so use the clock to dequeue instead.
      }
    }, initBlock.tickInterval);
  }
}

class UserSimulator {
  constructor(tempUserCount) {
    this.userArray = [];
    this.stateQueueCounter = 0;
    this.stateQueueArray = new Uint32Array(2048 * 2048 * 2);
    this.stateChangeCounter = 0;
    this.visTools = new VisualAux();

    this.stateCodes = {
      neverInitialized: 0,
      available: 51,
      previewingTask: 102,
      onCall: 153,
      afterCall: 204,
      loggedOut: 255,
    };

    this.initUserArray(tempUserCount);
  }

  initUserArray(tempUserCount) {
    for (let i = 0; i < tempUserCount; i++) {
      this.userJoin();
    }
  }

  userJoin(tempState, tempStateName) {
    if (tempState == null || tempStateName == null) {
      [tempState, tempStateName] = this.getValidJoinState();
    }
    this.userArray.push({
      userID: (VisualAux.randomFast() + 1).toString(36).substring(7),
      currentState: tempState,
      stateName: tempStateName,
      connectionTime: Math.floor(Date.now() * 0.001), // In epoch time.
      connectionStatus: "online",
    });
    let userIndex = this.userArray.length - 1;
    this.enqueueNewState(this.getTextureIndex(userIndex), tempState);
  }

  userLeave(tempIndex) {
    this.userArray[tempIndex].currentState = 255;
    this.userArray[tempIndex].stateName = "loggedOut";
    this.userArray[tempIndex].connectionStatus = "offline";
    this.enqueueNewState(this.getTextureIndex(tempIndex), tempState);
  }

  getValidJoinState() {
    let tempStateIndex = Math.floor(3 * Math.random()) + 1;
    let validCodes = {
      onCall: 153,
      available: 51,
      previewingTask: 102,
      afterCall: 204,
    };
    return Object.entries(validCodes)[tempStateIndex];
  }

  setStateUser(tempIndex, tempStateCode, tempStateName) {
    if (tempStateCode == 255) {
      this.userArray[tempIndex].connectionStatus = "offline";
    } else {
      this.userArray[tempIndex].connectionStatus = "online";
    }
    this.userArray[tempIndex].currentState = tempStateCode;
    this.userArray[tempIndex].stateName = tempStateName;

    this.enqueueNewState(this.getTextureIndex(tempIndex), tempStateCode);
  }

  // Use random noise function to select a user:
  setStateRandomUser(tempStateCode, tempStateName, lowerBound, upperBound) {
    if (upperBound == null || upperBound == 0) {
      upperBound = this.userArray.length - 1;
    }
    if (this.userArray.length == 0) {
      upperBound = 0;
    }

    var offset = this.stateChangeCounter / upperBound;
    var sineInput = runTime * 10000;
    if (!(runTime >> 0)) {
      sineInput = runTime * 10000000;
    }


    var userIndex = (upperBound * this.visTools.sineNoiseLookup(this.stateChangeCounter, sineInput, sineInput * 10, offset, this.stateChangeCounter)) >> 0;
    this.setStateUser(userIndex, tempStateCode, tempStateName);
  }

  // Maps a user index to a texel index:
  getTextureIndex(userArrayIndex) {
    return 4 * userArrayIndex;
  }

  // Maps a texel index to a user index:
  getTextureIndexInverse(userArrayIndex) {
    return 0.25 * userArrayIndex;
  }

  enqueueNewState(tempIndex, tempState) {
    this.stateQueueArray[this.stateQueueCounter] = tempIndex;
    this.stateQueueArray[this.stateQueueCounter + 1] = tempState;
    this.stateQueueCounter += 2;
    this.stateChangeCounter++;
  }

  dequeueNewStates(tempTexArray) {
    var [j, newColor, rollingTimer] = [0, 0, 0];
    rollingTimer = (dotColorTimer % 255) >> 0;

    for (let i = 0; i < this.stateQueueCounter - 1; i += 2) {
      j = this.stateQueueArray[i];
      newColor = this.stateQueueArray[i + 1];
      tempTexArray[j + 2] = newColor;
    }
    this.stateQueueCounter = 0;
  }

  collapseNewStateArray() {
    for (let i = 0; i < this.stateQueueCounter - 1; i++) {
      if (texIndex > prevTexIndex) {
        maxTexIndex == texIndex;
      }
    }
  }
}

class DataTexture {
  constructor(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.texBuffer = new ArrayBuffer(2048 * 2048 * 4);
    this.texArray = new Uint8Array(this.texBuffer, 0, tempWidth * tempHeight * 4);
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

  }

  /*
  randomizeTimers() {
    for (let i = 0; i < this.texArray.length; i += 4) {
      this.texArray[i + 3] = Math.floor(255 * Math.random());
    }
  }
  */

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

    // Use vertex_texture.
    gl.useProgram(programInfoB.program);
    twgl.setUniforms(programInfoB, uniforms);
    // Bind a framebuffer to write to colorTexture.
    twgl.bindFramebufferInfo(gl, this.stageBufferInfo);
    twgl.drawBufferInfo(gl, bufferInfo);

    // Unbind the framebuffer to write to the screen again.
    twgl.bindFramebufferInfo(gl, null);

    // Use vertex screen.
    gl.useProgram(programInfoA.program);
    twgl.setUniforms(programInfoA, uniforms);
    twgl.drawBufferInfo(gl, bufferInfo);
  }

  updateTextureDimensions(tempWidth, tempHeight) {
    var tempArrayLength = tempWidth * tempHeight * 4;
    if (this.texArray.length > tempArrayLength) {
      this.texArray.fill(0, this.texArray.length - 1, tempArrayLength);
      this.texArray = new Uint8Array(this.texBuffer, 0, tempArrayLength);
    } else {
      this.texArray = new Uint8Array(this.texBuffer, 0, tempArrayLength);
    }
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
  }


  updateAnimations(animLength) {
    var [buffColor, animTimer, rollingTimer] = [0, 0, 0];
    rollingTimer = (dotColorTimer % 255) >> 0;

    // Check runTime and a spatter of timers are empty to
    // flag for randomization.
    let initCheck = 1;
    if (!(runTime >> 0)) {
      initCheck = 0;
      for (let i = 0; i < 25; i++) {
        var tempIndex = (Math.random() * (this.texArray.length - 1)) / 4;
        tempIndex = (tempIndex * 4) % (this.texArray.length - 1) >> 0;
        initCheck += this.texArray[tempIndex];
      }
    }

    // Randomize the dot timers after init or focus loss to avoid animation stalls:
    if (deltaTime > 0.2 || initCheck == 0) {
      for (let i = 0; i < this.texArray.length - 4; i += 4) {
        let offsetTimers = (animLength * Math.random() + rollingTimer) % 255 >> 0;
        this.texArray[i + 3] = offsetTimers;
      }
    }

    for (let i = 0; i < this.texArray.length; i += 4) {
      buffColor = this.texArray[i + 2];
      animTimer = this.texArray[i + 3];
      // The rollingTimer has caught up with the forward position:
      if (rollingTimer == animTimer) {
        // If there's nothing in the buffer then let ending color be the new starting color.
        if ((this.texArray[i] == this.texArray[i + 1]) && buffColor == 0) {
          this.texArray[i] = this.texArray[i + 1];
          // If there is something in the buffer then do a downward swap and clear the buffer; 
        } else if (buffColor != 0) {
          this.texArray[i] = this.texArray[i + 1];
          this.texArray[i + 1] = buffColor;
          this.texArray[i + 2] = 0;
          // If there's nothing to do then stop animations by setting the start color and end color to the same value.
        } else {
          this.texArray[i] = this.texArray[i + 1];
        }
        // Create a new forward position for rollingTimer to catch up to.
        this.texArray[i + 3] = (rollingTimer + animLength) % 255;
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

class ColorTheme {
  constructor(tempThemeName) {
    this.theme = this.setColorTheme(tempThemeName);
  }

  setColorTheme(themeSelection) {
    let background, available, previewingTask,
      onCall, afterCall, loggedOut;
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
        // Theme from the client's slide:
        background = [0, 0, 0, 255];
        available = [63, 191, 177, 255];
        previewingTask = [0, 110, 184, 255];
        onCall = [243, 108, 82, 255];
        afterCall = [255, 205, 52, 255];
        loggedOut = [0, 48, 70, 255];
        break;
    }

    if (themeSelection != "random") {
      tempColorTheme = [].concat(background, available, previewingTask,
        onCall, afterCall, loggedOut);
    }

    document.body.style.backgroundColor = "rgb(" + tempColorTheme[0] + ","
      + tempColorTheme[1] + "," + tempColorTheme[2] + ")";

    // Normalize values for the shader.
    for (let i = 0; i < tempColorTheme.length; i++) {
      tempColorTheme[i] = tempColorTheme[i] / 255;
    }
    return tempColorTheme;
  }

  inverseStatusCode(tempCode) {
    let tempColor;
    let tempColorArray = [];

    if (tempCode != null) {
      let arrayStart = (tempCode / 51) * 4;
      let arrayEnd = arrayStart + 3;
      tempColorArray = this.theme.slice(arrayStart, arrayEnd);
    }

    tempColor = "rgb(" + 255 * tempColorArray[0] + ","
      + 255 * tempColorArray[1] + "," + 255 * tempColorArray[2] + ");";

    return tempColor;
  }
}

class VisualAux {
  'use strict'
  constructor() {
    let sineLength = 100000;
    this.randomSeed = Date.now();
    this.sineArray = VisualAux.createSineArrayDegrees(sineLength);
    this.sineRes = (2 * Math.PI) / sineLength;
  }

  // mulberry32:
  static randomFast(seed) {
    if (seed == null) {
      this.randomSeed = Date.now();
      seed = this.randomSeed;
    }
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | this.randGenState);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  sineNoiseLookup(timeScale, inputA, inputB, offsetA, offsetB) {
    var modLength = this.sineArray.length - 1;
    var cycle_2 = (this.sineRes * (2 * inputA * timeScale + offsetA)) % modLength >> 0;
    var cycle_PI = (this.sineRes * (3.1415926 * inputB * timeScale + offsetB)) % modLength >> 0;
    var sineNormal = 0.25 * (2 + this.sineArray[cycle_2] + this.sineArray[cycle_PI]);
    return sineNormal;
  }

  static createSineArrayDegrees(tempRes) {
    if (tempRes == null) {
      tempRes = 360;
    }

    let tempSineArray = new Float32Array(tempRes);
    let tempScale = (2 * Math.PI) / tempRes;
    for (let i = 0; i < tempRes - 1; i++) {
      tempSineArray[i] = Math.sin(i * tempScale);
    }
    return tempSineArray;
  }

  static sineNoise(lowerBound, upperBound, timeScale, inputA, inputB) {
    let noiseTimer = runTime * 1000 * timeScale;
    let randomNoise = (0.25 * (2 + Math.sin(2 * inputA * noiseTimer) + Math.sin(Math.PI * inputB * noiseTimer))
      * (upperBound - lowerBound + 1) + lowerBound) >> 0;
    return randomNoise;
  }

  static createProbabilityArray(mean, deviation, arrayLength) {
    let tempArray = [];
    for (let i = 0; i < arrayLength; i++) {
      tempArray.push(Math.min(Math.max((mean + deviation * Math.sin(2 * Math.PI * Math.random())), 0), 1));
    }
    tempArray.sort((a, b) => a + b);
    return tempArray;
  }

  static scaleFragCoords(tempWidth, tempHeight, tempScaleType) {
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
      case 'preserve':
        scaleY = 1;
        scaleX = textureAspectRatio / canvasAspectRatio;
        if (scaleX > 1) {
          scaleY = 1 / scaleX;
          scaleX = 1;
        }
        break;
      case 'stretch':
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
}

gridCanvas.addEventListener('mousemove', (e) => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;
});

setup();
