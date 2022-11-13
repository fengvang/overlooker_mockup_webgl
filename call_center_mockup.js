var [mouseX, mouseY, runTime, deltaTime, dotColorTimer, gTools] = [0, 0, 0, 0, 0, 0];

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
  let [initBlock, layout] = [0, 0];
  gTools = new VisualAux();

  /*
    simBehavior:      Used to select LayoutSimGrid's setInterval() loop. 
    tickInterval:     The (rough) time in milliseconds between sim clock ticks.
    startCount:       The initial number of users.
    endCount:         Number of users before the sim clears back to startCount.
    animInterval:     The animation length of the dot color transition in 1/20 seconds (integers only).
    updateRatio:      The ratio of total users to receive a state change per tick of sim clock.
    maxStateQueue:    Number of new state changes in UserSim's stateQueueArray before a dump to DataTexture.texArray is forced.
    joinAnimInterval: How long to wait before allowing a user to join.
    joinPerTick:      The number of joins per tick of sim clock.
    themeSelection:   Options: "random", default
    dotPadding:       The gap between dots from 0 to 1 where 1 turns off dots completely. Negative values create squares.
    tilingSpanMode:   Defines the behavior of the UserGrid. Options: "spanWidth", "spanHeight", "maxArea", "maxTiles" 
  */

  // Options: "growing", default.
  let tempLayout = "";

  switch (tempLayout) {
    case "growing":
      initBlock = {
        simBehavior: "usersAdd",
        tickInterval: 25,
        startCount: 1,
        endCount: 1000000,
        animInterval: 10,
        joinAnimInterval: 10,
        joinPerTick: 1,
        updateRatio: 0.125,
        maxStateQueue: 500000,
        themeSelection: "random",
        dotPadding: 0.15,
        tilingSpanMode: "maxArea",
      }
      layout = new LayoutUserGrid(initBlock);
      break;
    default:
      initBlock = {
        simBehavior: "usersStatic",
        tickInterval: 25,
        startCount: 10000,
        animInterval: 10,
        updateRatio: 0.125,
        maxStateQueue: 500000,
        themeSelection: "random",
        dotPadding: 0.15,
        tilingSpanMode: "maxArea",
      }
      layout = new LayoutUserGrid(initBlock);
  }
}

class LayoutUserGrid {
  constructor(tempInitBlock) {
    this.prevTime = 0;
    this.initBlock = tempInitBlock;
    this.gridMain = new UserGrid(this.initBlock.startCount, gl.canvas.width, gl.canvas.height, this.initBlock.dotPadding, this.initBlock.tilingSpanMode);
    this.userSim = new UserSimulator(this.initBlock.startCount);
    this.texMain = new DataTexture(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    this.layoutTheme = new ColorTheme(this.initBlock.themeSelection);
    this.mouseOver = { index: "uninit", user: 0, };
    uniforms.u_interval = this.initBlock.animInterval;

    // WebGL is likely to throw an error if these haven't been set before draw loop.
    uniforms.u_texture_color = this.texMain.colorTexture;
    uniforms.u_texture_data = this.texMain.dataTexture;

    // List of state codes valid for someone joining:
    this.validStateNames = ["onCall", "available", "previewingTask", "afterCall", "loggedOut"];
    this.validStateCodes = [153, 51, 102, 204, 255];

    // Create a click listener for selecting users:
    addEventListener('click', (event) => {
      this.mouseClick();
    });

    // Pick from simBehavior and start the sim loop.
    if (this.initBlock.simBehavior == "usersAdd") {
      this.simLoopUsersAdd();
    } else if (this.initBlock.simBehavior == "usersStatic") {
      this.simLoopUsersStatic();
    } else {
      throw new Error("Invalid simBehavior specified");
    }
    requestAnimationFrame(this.render); // Start the draw loop.
  }

  render = (time) => {
    // Update the animation and persistence timers.
    runTime = time * 0.001;
    dotColorTimer = time * 0.02;
    deltaTime = runTime - this.prevTime;

    if (twgl.resizeCanvasToDisplaySize(gl.canvas)) {
      this.gridMain.resize(gl.canvas.width, gl.canvas.height);
      this.texMain.updateTextureDimensions(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    }

    // These are the parameters that are passed into the shader to do things like color selection
    // and animation timing. 
    uniforms.u_time = (dotColorTimer) % 255;
    uniforms.u_resolution = [gl.canvas.width, gl.canvas.height];
    uniforms.u_gridparams = [this.texMain.texWidth, this.texMain.texHeight, this.gridMain.parameters.padding];
    uniforms.u_colortheme = this.layoutTheme.theme;
    uniforms.u_matrix = VisualAux.scaleFragCoords(this.texMain.texWidth, this.texMain.texHeight, "preserve");

    this.texMain.updateTexture();                                  // Create a fresh texture.
    this.texMain.display(this.initBlock.animInterval);             // Use data from textures to draw the dots.
    this.userSim.dequeueNewStates(this.texMain.texArray);          // Get the newest data to texArray.
    this.texMain.updateAnimations(this.initBlock.animInterval);    // Pop from buffers, stop timers, start new timers, etc.

    // Check if the grid needs to be grows to accomodate the number of users.
    if (this.userSim.userArray.length > this.gridMain.parameters.activeTiles) {
      let addCount = this.userSim.userArray.length - this.gridMain.parameters.activeTiles;
      this.gridMain.addTiles(addCount, gl.canvas.width, gl.canvas.height);
      this.texMain.updateTextureDimensions(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    }

    this.prevTime = runTime;
    requestAnimationFrame(this.render); // Repeat the draw loop.
  }

  simLoopUsersAdd() {
    var joinBatchTimer = dotColorTimer;

    let clientClock = setInterval(() => {
      // UpdatesPerTick is recalculated each loop to account for new users joining.
      var updatesPerTick = this.userSim.userArray.length * this.initBlock.updateRatio;

      // Allow joins only if joinBatchTimer is greater than the dot color animation interval.
      if (dotColorTimer - joinBatchTimer >= 2 * this.initBlock.joinAnimInterval) {
        for (let i = 0; i < this.initBlock.joinPerTick; i++) {
          var [tempStateCode, tempStateName] = this.getRandomState();
          this.userSim.userJoin(tempStateCode, tempStateName);
        }
        joinBatchTimer = dotColorTimer;
      } else {
        joinBatchTimer += deltaTime;
      }

      // Select a random user by index and give them a new state:
      var [tempStateCode, tempStateName, maxIndex] = [0, 0, 0, 0];
      for (let i = 0; i < updatesPerTick; i++) {
        [tempStateCode, tempStateName] = this.getRandomState();

        // Avoid updating users on the last line since it makes it easier to confirm correct state persistence.
        maxIndex = this.gridMain.parameters.columns * (this.gridMain.parameters.rows - 1);
        this.userSim.setStateRandomUser(tempStateCode, tempStateName, maxIndex);
      }

      // Go back to original starting count once there are too many users.
      if (this.userSim.userArray.length > this.initBlock.endCount) {
        this.resetGrid(this.initBlock.startCount);
        joinBatchTimer = 0;
      }

      // The draw loop doesn't run while minimized, so use the clock to dequeue so we don't run out of memory.
      if (this.userSim.stateQueueCounter >= this.initBlock.maxStateQueue) {
        this.userSim.dequeueNewStates(this.texMain.texArray);
      }
    }, this.initBlock.tickInterval);
  }

  simLoopUsersStatic() {
    var [tempStateCode, tempStateName] = [0, 0];
    let updatesPerTick = this.userSim.userArray.length * this.initBlock.updateRatio;
    let maxIndex = this.userSim.userArray.length - 1;

    let clientClock = setInterval(() => {

      // Assign a proportion of users a new random state each loop.
      for (let i = 0; i < updatesPerTick; i++) {
        [tempStateCode, tempStateName] = this.getRandomState();
        this.userSim.setStateRandomUser(tempStateCode, tempStateName, maxIndex);
      }

      // The draw loop doesn't run while minimized, so use the clock to dequeue so we don't run out of memory.
      if (this.userSim.stateQueueCounter >= this.initBlock.maxStateQueue) {
        this.userSim.dequeueNewStates(this.texMain.texArray);
      }
    }, this.initBlock.tickInterval);
  }

  // Currently prints user info to console.
  mouseClick() {
    var tempMouseOver = { index: this.gridMain.getMouseOverIndex(), user: 0 };

    if (Number.isInteger(tempMouseOver.index)) {
      tempMouseOver.user = this.userSim.userArray[tempMouseOver.index];

      // The string format returned by ColorTheme.inverseStatusCode() is "rgb(255, 255, 255)".
      let tempColor = 'font-weight: bold; background-color: ' + (this.layoutTheme.inverseStatusCode(tempMouseOver.user.currentState));
      console.log('%cuserArray[%s]:', tempColor, tempMouseOver.index, tempMouseOver.user);
    } else {
      console.log("Offscreen or missed!");
    }
  }

  // TextureData should never be set to null since it can cause memory leaks and textures will resize next cycle anyways. 
  resetGrid(startCount) {
    let [dotPadding, spanMode] = [this.gridMain.parameters.padding, this.gridMain.parameters.spanMode];
    [this.gridMain, this.userSim] = [null, null];
    this.gridMain = new UserGrid(startCount, gl.canvas.width, gl.canvas.height, dotPadding, spanMode);
    this.userSim = new UserSimulator(startCount);
  }

  // State codes are selected by probability to tune noise.
  getRandomState() {
    var tempStateIndex = (5 * gTools.randomFast()) >> 0;
    return [this.validStateCodes[tempStateIndex], this.validStateNames[tempStateIndex]]
  }
}

class UserSimulator {
  constructor(tempUserCount) {
    this.userArray = [];
    this.stateQueueCounter = 0;
    this.stateQueueArray = new Uint32Array(4096 * 4096 * 3);
    this.stateChangeCounter = 0;
    this.noiseTimer = 0;

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
      userID: (Math.random() + 1).toString(36).substring(7),
      currentState: tempState,
      stateName: tempStateName,
      connectionTime: Math.floor(Date.now() * 0.001), // In epoch time.
      connectionStatus: "online",
    });
    let tempIndex = this.userArray.length - 1;
    this.enqueueNewState(this.getTextureIndex(tempIndex), tempState, 1);
  }

  userLeave(tempIndex) {
    this.userArray[tempIndex].currentState = 255;
    this.userArray[tempIndex].stateName = "loggedOut";
    this.userArray[tempIndex].connectionStatus = "offline";
    this.enqueueNewState(this.getTextureIndex(tempIndex), 255, 0);
  }

  getValidJoinState() {
    let tempStateIndex = (3 * Math.random() + 1) >> 0;
    let validStateCodes = [153, 51, 102, 204];
    let validStateNames = ["onCall", "available", "previewingTask", "afterCall"];
    return [validStateCodes[tempStateIndex], validStateNames[tempStateIndex]];
  }

  setStateUser(tempIndex, tempState, tempStateName) {
    if (tempStateName == "loggedOut") {
      this.userArray[tempIndex].connectionStatus = "offline";
    } else {
      this.userArray[tempIndex].connectionStatus = "online";
    }
    this.userArray[tempIndex].currentState = tempState;
    this.userArray[tempIndex].stateName = tempStateName;
    this.enqueueNewState(this.getTextureIndex(tempIndex), tempState, 0);
  }

  // Use random noise function to select a user:
  setStateRandomUser(tempStateCode, tempStateName, maxIndex) {
    var arrayLength = this.userArray.length - 1;

    // Guard against invalid indexes.
    if (maxIndex > arrayLength || maxIndex < 0) {
      maxIndex = arrayLength;
    } else if (this.noiseTimer > arrayLength) {
      this.noiseTimer = 0;
    }

    // Noise tuning parameters.
    var offsetA = dotColorTimer;
    var offsetB = offsetA * 10;
    var sineInputA = (dotColorTimer * 1000) % 360;
    var sineInputB = sineInputA;

    // Apply noise more aggressively during first run.
    if (!(runTime >> 0)) {
      sineInputA = 1000000 * dotColorTimer;
      sineInputB = sineInputA * 10;
    }

    var userIndex = (this.noiseTimer * gTools.sineNoiseLookup(sineInputA, sineInputB, offsetA, offsetB)) % arrayLength >> 0;
    this.setStateUser(userIndex, tempStateCode, tempStateName);
    this.noiseTimer++;
  }

  // Maps a user index to a texel index:
  getTextureIndex(userArrayIndex) {
    return 4 * userArrayIndex;
  }

  // Maps a texel index to a user index:
  getTextureIndexInverse(userArrayIndex) {
    return 0.25 * userArrayIndex;
  }

  enqueueNewState(tempIndex, tempState, newUserFlag) {
    this.stateQueueArray[this.stateQueueCounter] = tempIndex;
    this.stateQueueArray[this.stateQueueCounter + 1] = tempState;
    this.stateQueueArray[this.stateQueueCounter + 2] = newUserFlag;
    this.stateQueueCounter += 3;
    this.stateChangeCounter++;
  }

  dequeueNewStates(tempTexArray) {
    var [j, newColor, rollingTimer] = [0, 0, 0];
    rollingTimer = (dotColorTimer % 255) >> 0;

    for (let i = 0; i < this.stateQueueCounter - 1; i += 3) {
      j = this.stateQueueArray[i];
      newColor = this.stateQueueArray[i + 1];
      tempTexArray[j + 2] = newColor;

      // Set the user's timestamp if they're new.
      if (this.stateQueueArray[i + 2] == 1) {
        tempTexArray[j + 3] = rollingTimer;
      }
    }
    // The end point is reset without clearing values in stateQueueArray.
    this.stateQueueCounter = 0;
  }
}

class DataTexture {
  constructor(tempWidth, tempHeight) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.texBuffer = new ArrayBuffer(4096 * 4096 * 4);
    this.texArray = new Uint8Array(this.texBuffer, 0, tempWidth * tempHeight * 4);
    this.colorTexture = this.createTexture(tempWidth, tempHeight);
    this.dataTexture = this.createTexture(tempWidth, tempHeight);
    this.initFramebuffer();
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
      level: 0,
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

    // Use fragment_texture and vertex_texture shaders.
    gl.useProgram(programInfoB.program);
    twgl.setUniforms(programInfoB, uniforms);

    // Bind a framebuffer to write to colorTexture.
    twgl.bindFramebufferInfo(gl, this.stageBufferInfo);
    twgl.drawBufferInfo(gl, bufferInfo);

    // Unbind the framebuffer to write to the screen again.
    twgl.bindFramebufferInfo(gl, null);

    // Use fragment_screen and vertex_screen shaders.
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

    // Push the animations during the first run so they can start without waiting a cycle.
    if (!(runTime >> 0)) {
      deltaTime += 0.1;
    }

    // Randomize the timestamps to avoid animation stalls:
    if (deltaTime > 0.2) {
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
  getMouseOverIndex() {
    let inverseScanX = Math.floor((mouseX - this.parameters.marginX) / this.parameters.tileSize);
    let inverseScanY = Math.floor((mouseY - this.parameters.marginY) / this.parameters.tileSize);
    let tempMouseOverIndex = inverseScanX + inverseScanY * this.parameters.columns;
    let mouseOverIndex = 0;

    if (inverseScanX < 0 || this.parameters.columns <= inverseScanX || inverseScanY < 0 || this.parameters.activeTiles <= tempMouseOverIndex) {
      mouseOverIndex = "UDF";
      // Treats dots as circular if there are less than 1000.
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
    let sineLength = 5000000;
    this.randomSeed = 0;
    this.sineArray = VisualAux.createSineArray(sineLength);
    this.sineScale = (180 / Math.PI) * sineLength;
  }

  randomFast(seed) {
    if (seed == null) {
      this.randomSeed += (dotColorTimer * 1000) >> 0;
      seed = this.randomSeed;
    }

    // mulberry32:
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  sineNoiseLookup(inputA, inputB, offsetA, offsetB) {
    var modLength = this.sineArray.length - 1;
    var cycle_2 = (this.sineScale * (2 * inputA + offsetA)) % modLength >> 0;
    var cycle_PI = (this.sineScale * (Math.PI * inputB + offsetB)) % modLength >> 0;
    var sineNormal = (0.25 * (2.0 + this.sineArray[cycle_2] + this.sineArray[cycle_PI]))
    * (1.0 - 0.0) + (1 + 0.0) >> 0;
    
    return sineNormal;
  }

  static createSineArray(tempRes) {
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
    tempArray.sort((a, b) => a - b);
    return tempArray;
  }

  static createProbabilityArrayMisordered(mean, deviation, arrayLength) {
    let tempArray = [];
    for (let i = 0; i < arrayLength; i++) {
      tempArray.push(Math.min(Math.max((mean + deviation * Math.sin(2 * Math.PI * Math.random())), 0), 1));
    }
    tempArray.sort((a, b) => a + b); // Improper sort.
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
