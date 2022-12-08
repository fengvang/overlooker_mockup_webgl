"use strict";

const gridCanvas = document.getElementById("cgl");
const gl = gridCanvas.getContext("webgl", { cull: false, antialias: false });
const shaderStageTexture = twgl.createProgramInfo(gl, ["vertex_texture", "fragment_texture"]);
const shaderStageScreen = twgl.createProgramInfo(gl, ["vertex_screen", "fragment_screen"]);

if (gl == null || shaderStageScreen == null || shaderStageTexture == null) {
  throw new Error("WebGL context creation has failed. Your device or browser must be able"
    + " to use WebGL 1.0 to continue.");
}

// Vertices for a unit quad (two triangles in shape of a square) that spans the
// div so the fragment shader can write to the screen.
const glArrays = {
  a_position: [-1.0, -1.0, 0.0, 1.0, -1.0, 0.0, -1.0, 1.0, 0.0,
  -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, 1.0, 1.0, 0.0,
  ],
  a_texcoord: [0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
    0.0, 1.0, 1.0, 0.0, 1.0, 1.0,
  ],
};

// Uniforms are constants shared by every vertex and fragment for each shader. 
const uniforms = {
  u_time: 0, u_mouse: [0, 0,], u_interval: 0,
  u_resolution: [0, 0,], u_aafactor: 0, u_gridparams: [0, 0, 0,], u_colortheme: 0,
  u_texture_data: 0, u_texture_color: 0, u_matrix: 0,
};
const bufferInfo = twgl.createBufferInfoFromArrays(gl, glArrays);
twgl.setBuffersAndAttributes(gl, shaderStageScreen, bufferInfo);
twgl.setBuffersAndAttributes(gl, shaderStageTexture, bufferInfo);

var runTime = 0;
var layout = 0; // Take out of global context for real deployment.
function setup() {
  'use strict'

  /*
    TODO: Redo initBlock explanations.
  */

  let tempLayout = "";
  let initBlock = 0;
  switch (tempLayout) {
    case "growing":
      initBlock = {
        ticksPerSecond: 20,
        colorMixDuration: 0.5,
        startingUsers: 1,
        maxUsers: 1000000,
        joinPerTick: 1,
        updateRatio: 0.06,
        themeSelection: "RandomHSV",
        dotPadding: 0.15,
        tilingSpanMode: "maxArea",
        tickInterval: 25,
      }
      layout = new LayoutUserGrid(initBlock);
      break;
    default:
      initBlock = {
        ticksPerSecond: 50,
        colorMixDuration: 0.5,
        startingUsers: 10000,
        maxUsers: 10000,
        joinPerTick: 0,
        updateRatio: 0.06,
        themeSelection: "RandomHSV",
        dotPadding: 0.15,
        tilingSpanMode: "maxArea",
        tickInterval: 25,
      }
      layout = new LayoutUserGrid(initBlock);
  }
}

class LayoutUserGrid {
  constructor(tempInitBlock) {
    this.initBlock = tempInitBlock;
    this.userCount = tempInitBlock.startingUsers;
    this.gridMain = new UserGrid(this.userCount, gl.canvas.width, gl.canvas.height, tempInitBlock.dotPadding, tempInitBlock.tilingSpanMode);
    this.userSim = new UserSimulator(this.userCount, tempInitBlock.maxUsers);
    this.texMain = new DataTexture(this.gridMain.parameters.columns, this.gridMain.parameters.rows, tempInitBlock.maxUsers);
    uniforms.u_texture_color = this.texMain.colorTexture;
    uniforms.u_texture_data = this.texMain.dataTexture;
    this.layoutTheme = new ColorTheme(tempInitBlock.themeSelection);
    this.mouseOver = { index: "uninit", user: 0, };
    this.gridAnimations = new AnimationGL(tempInitBlock.ticksPerSecond, tempInitBlock.colorMixDuration, 1, this.userCount, tempInitBlock.maxUsers);

    // Create a click listener for selecting users:
    addEventListener('click', (event) => {
      this.mouseClick(event);
    });

    if (typeof uniforms.u_texture_color != 'object' || typeof uniforms.u_texture_color != 'object') {
      throw new Error("u_texture_color and u_texture_data have to be set to a valid WebGL texture before"
        + " the draw loop is started. Try using DataTexture.colorTexture and DataTexture.dataTexture from a DataTexture instance.");
    }

    this.simLoop(); // Start sim loop.
    requestAnimationFrame(this.render); // Start draw loop.
  }

  // All uniforms are here excluding the texture samplers which are set once
  // before the draw loop.
  updateUniforms() {
    uniforms.u_resolution = [gl.canvas.width, gl.canvas.height];
    uniforms.u_gridparams = [this.gridMain.parameters.columns, this.gridMain.parameters.rows, this.gridMain.parameters.padding];

    // Eyeballed sub pixel value for anti-aliasing. Need the actual screen
    // resolution rather than browser window size but can't get it from CSS so
    // dots are slightly blurry.
    uniforms.u_aafactor = this.texMain.texHeight * 1.5 / gl.canvas.height;

    uniforms.u_colortheme = this.layoutTheme.theme;
    uniforms.u_matrix = VisualAux.scaleFragCoords(this.texMain.texWidth, this.texMain.texHeight, "preserve");
    uniforms.u_time = this.gridAnimations.shaderLoop;
    uniforms.u_interval = this.gridAnimations.colorMixDuration;
  }

  render = (time) => {
    runTime = time * 0.001;
    this.gridAnimations.updateTimersDrawloopStart(time);

    // Checks for a window resize and adjusts the grid + shader dimensions if
    // necessary.
    if (twgl.resizeCanvasToDisplaySize(gl.canvas)) {
      this.gridMain.resize(gl.canvas.width, gl.canvas.height);
      this.texMain.updateTextureDimensions(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    }

    // Gets fresh data to the shaders.
    this.updateUniforms();

    // Dequeues the newest state changes from userSim and stores them in a state
    // buffer within gridAnimations.
    let [indexUpdateQueue, stateUpdateQueue] = this.userSim.dequeueNewStates();
    this.gridAnimations.updateColorMixBuffer(indexUpdateQueue, stateUpdateQueue);

    // Pops state from the buffer, sets animation end time, and resets control
    // timer for users that have completed their color mixing animation.
    // Increments control timer for those who haven't. 
    this.gridAnimations.updateColorMix(this.texMain.texArray, this.userCount);

    // Creates a new texture from texArray; contains all changes from the
    // previous step since it was passed by reference.
    this.texMain.updateTexture();

    // Prints the dots to the screen.
    this.texMain.display();

    // Grows grid to accomodate user joins.
    if (this.userCount > this.gridMain.parameters.activeTiles) {
      let newCount = this.userCount - this.gridMain.parameters.activeTiles;
      this.gridMain.addTiles(newCount, gl.canvas.width, gl.canvas.height);
      this.texMain.updateTextureDimensions(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    }

    this.gridAnimations.updateTimersDrawloopEnd(time);
    requestAnimationFrame(this.render); // Repeat the draw loop.
  }

  simLoop() {
    let clientClock = setInterval(() => {
      let updatesPerTick = Math.ceil(this.userSim.userArray.length * this.initBlock.updateRatio);

      for (let i = 0; i < this.initBlock.joinPerTick; i++) {
        var [tempStateCode, tempStateName] = this.getRandomState();
        this.userSim.userJoin(tempStateCode, tempStateName);
        this.userCount++;
      }

      // Prevents overflow of updateQueue. TODO: switch this out for a ring buffer within userSim.
      if (this.userSim.updateQueueCounter + updatesPerTick >= 2 * (this.initBlock.maxUsers - 1)) {
        let [indexUpdateQueue, stateUpdateQueue] = this.userSim.dequeueNewStates();
        this.gridAnimations.updateColorMixBuffer(indexUpdateQueue, stateUpdateQueue);
        this.gridAnimations.updateColorMix(this.texMain.texArray, this.userCount);
      }

      // Uses a noise function to select which users will receive a state update.
      for (let i = 0; i < updatesPerTick; i++) {
        var [tempStateCode, tempStateName] = this.getRandomState();
        let tempIndex = this.gridAnimations.tileIndexNoise(this.gridMain, this.userSim.userArray.length - 1);
        this.userSim.setStateUser(tempIndex, tempStateCode, tempStateName);
      }

      if (this.userCount > this.initBlock.maxUsers) {
        this.resetGrid();
      }
    }, this.initBlock.tickInterval);
  }

  mouseClick(event) {
    // Give dots circular bounds if there are less than 1000 users on screen.
    let circularDotsFlag = 0;
    if (this.userSim.userArray.length < 1000) {
      circularDotsFlag = 1;
    }

    // Use relative positioning to account for other CSS elements.
    var rect = event.target.getBoundingClientRect();
    var mouseX = event.clientX - rect.left;
    var mouseY = event.clientY - rect.top;

    var tempMouseOver = { index: this.gridMain.getTileIndex(mouseX, mouseY, circularDotsFlag), user: 0 };
    if (tempMouseOver.index == "invalid") {
      console.log("Offscreen or missed!");
    } else {
      tempMouseOver.user = this.userSim.userArray[tempMouseOver.index];

      // tempColor is in "rgb(r, g, b)" CSS color
      let tempColor = 'font-weight: bold; background-color: ' + (this.layoutTheme.colorLookup(tempMouseOver.user.currentState));
      console.log('%cuserArray[%s]:', tempColor, tempMouseOver.index, tempMouseOver.user);
    }
  }

  // TextureData should never be set to null since it can cause memory leaks and
  // textures will resize next cycle anyways. 
  resetGrid() {
    this.userCount = this.initBlock.startingUsers;
    [this.gridMain, this.userSim] = [null, null];
    this.gridMain = new UserGrid(this.userCount, gl.canvas.width, gl.canvas.height, this.initBlock.dotPadding, this.initBlock.tilingSpanMode);
    this.userSim = new UserSimulator(this.userCount, this.initBlock.maxUsers);
  }

  // Grabs from a list of states excluding uninitialized.
  getRandomState() {
    var validStateNames = ["onCall", "available", "previewingTask", "afterCall", "loggedOut"];
    var validStateCodes = [153, 51, 102, 204, 255];
    var tempStateIndex = (5 * Math.random()) >> 0;
    return [validStateCodes[tempStateIndex], validStateNames[tempStateIndex]];
  }
}

class UserSimulator {
  constructor(tempUserCount, tempMaxUserCount) {
    if (tempMaxUserCount == null) {
      throw new Error("UserSimulator requires maxUserCount in its constructor.")
    } else if (tempUserCount == null) {
      console.log("UserSimulator was initialized without any users, make sure DataTexture and UserGrid were"
        + " also initialized the same.")
    }

    this.userArray = [];
    this.maxUsers = tempMaxUserCount;
    this.updateQueueIndexBuffer = new ArrayBuffer(2 * 4 * tempMaxUserCount); // Using Uint32, since Uint16 maxes at only 65535.
    this.updateQueueStateBuffer = new ArrayBuffer(2 * tempMaxUserCount);
    this.updateQueueIndex = new Uint32Array(this.updateQueueIndexBuffer, 0, tempMaxUserCount);
    this.updateQueueState = new Uint8Array(this.updateQueueStateBuffer, 0, tempMaxUserCount);

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
    this.enqueueNewState(tempIndex, tempState);
  }

  userLeave(tempIndex) {
    this.userArray[tempIndex].currentState = 255;
    this.userArray[tempIndex].stateName = "loggedOut";
    this.userArray[tempIndex].connectionStatus = "offline";
    this.enqueueNewState(tempIndex, 255);
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
    this.enqueueNewState(tempIndex, tempState);
  }

  enqueueNewState(tempIndex, tempState) {
    this.updateQueueIndex[this.updateQueueCounter] = tempIndex;
    this.updateQueueState[this.updateQueueCounter] = tempState;
    this.updateQueueCounter++;
  }

  dequeueNewStates() {
    let tempQueueIndex = new Uint32Array(this.updateQueueIndexBuffer, 0, this.updateQueueCounter);
    let tempQueueState = new Uint8Array(this.updateQueueStateBuffer, 0, this.updateQueueCounter);
    this.updateQueueCounter = 0;
    return [tempQueueIndex, tempQueueState];
  }
}

class DataTexture {
  constructor(tempWidth, tempHeight, tempMaxTiles) {
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;

    // TODO: enforce minimum window dimensions so narrow windows can't cause
    // thousands of texels.
    let maxTexels = 0;
    if (tempMaxTiles < 100) {
      maxTexels = 500; 
    } else {
      maxTexels = (tempMaxTiles - 1) * 2; // Account for *reasonable worst case texture size.
    }
    this.texBuffer = new ArrayBuffer(maxTexels * 4);

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

    // Use the fragment_texture and vertex_texture shaders to process the color
    // codes and timing info in dataTexture.
    gl.useProgram(shaderStageTexture.program);
    twgl.setUniforms(shaderStageTexture, uniforms);

    // Bind the output of the current fragment shader to a framebuffer so that
    // the processed colors can be written to colorTexture.
    twgl.bindFramebufferInfo(gl, this.stageBufferInfo);
    twgl.drawBufferInfo(gl, bufferInfo);

    // Unbind the framebuffer to write to the screen again.
    twgl.bindFramebufferInfo(gl, null);

    // Use the fragment_screen and vertex_screen shaders to draw the dots to the
    // screen using colors from colorTexture.
    gl.useProgram(shaderStageScreen.program);
    twgl.setUniforms(shaderStageScreen, uniforms);
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
}

class AnimationGL {
  constructor(tempTicksPerSecond, tempColorMixDuration, tempPulseDuration, totalObjects, tempMaxUsers) {

    if (Math.floor(tempTicksPerSecond) - tempTicksPerSecond != 0) {
      throw new Error("ticksPerSecond must be an integer value.");
    } else if (tempTicksPerSecond * tempColorMixDuration > 255 || tempTicksPerSecond * tempPulseDuration > 255) {
      throw new Error("Animations are not allowed to last longer than 255 ticks.");
    } else if (tempColorMixDuration * tempTicksPerSecond < 1 || tempPulseDuration * tempTicksPerSecond < 1) {
      throw new Error("A shader animation lasts less than a single tick, animations cannot progress.");
    }

    if (!Number.isInteger(tempColorMixDuration * tempTicksPerSecond) || !Number.isInteger(tempPulseDuration * tempTicksPerSecond)) {
      this.colorMixDuration = Math.round(tempColorMixDuration * tempTicksPerSecond);
      this.pulseDuration = Math.round(tempPulseDuration * tempTicksPerSecond);
      console.log("A shader animation was rounded to last a discrete number of ticks.");
    } else {
      this.colorMixDuration = tempColorMixDuration * tempTicksPerSecond;
      this.pulseDuration = tempPulseDuration * tempTicksPerSecond;
    }

    this.ticksPerSecond = tempTicksPerSecond;
    this.timescale = tempTicksPerSecond * 0.001;
    this.maxUsers = tempMaxUsers;

    this.timerColorMixBuffer = new ArrayBuffer(tempMaxUsers * 4); // Float32
    this.timerPulseBuffer = new ArrayBuffer(tempMaxUsers * 4);    // Float32
    this.newStateBuffer = new ArrayBuffer(tempMaxUsers);          // Uint8

    // Timing variables.
    this.timer = 0;
    this.prevTime = 0;
    this.deltaTime = 0;
    this.shaderLoop = 0;
    this.floatTimestamp = 0;

    // Index selection variables.
    this.iteratorX = 0;
    this.iteratorY = 0;

    // Color mixing variables.
    this.uninitCode = 253;
    this.emptyCode = 254;

    let stateBuffer = new Uint8Array(this.newStateBuffer, 0, this.maxUsers);
    stateBuffer.set(this.uninitCode);

    this.scatterTimers(totalObjects);
  }

  // Introduces random delay to reduce animation clumping.
  scatterTimers(totalObjects) {
    let tempTimerColorArray = new Float32Array(this.timerColorMixBuffer, 0, totalObjects);
    let tempTimerPulseArray = new Float32Array(this.timerPulseBuffer, 0, totalObjects);

    for (let i = 0; i < totalObjects; i++) {
      tempTimerColorArray[i] = -Math.random() * 2.5 * this.ticksPerSecond;
      tempTimerPulseArray[i] = -Math.random() * 2.5 * this.ticksPerSecond;
    }
  }

  // Stores newest states to a buffer which is popped when a user finishes their
  // color mix animation. Inputs must be in the form of a queue so that the
  // latest states override the oldest.
  updateColorMixBuffer(indexUpdateQueue, stateUpdateQueue) {
    let stateBuffer = new Uint8Array(this.newStateBuffer, 0, this.maxUsers);

    for (let i = 0; i < stateUpdateQueue.length; i++) {
      stateBuffer[indexUpdateQueue[i]] = stateUpdateQueue[i];
    }
  }

  // This function maintains the color mix animation. 
  //
  // This is a shader based animation and progresses by referencing the end time
  // stored in texArray[i + 3] with shaderLoop which is passed as a uniform.
  //
  // Since shaderLoop is a looping timer, every animation would repeat itself
  // without intervention. Control timers are used on the JS side to perform the
  // necessary updates to texArray to start and end animations.
  updateColorMix(texArray, totalObjects) {
    let stateBuffer = new Uint8Array(this.newStateBuffer, 0, totalObjects);
    let timerView = new Float32Array(this.timerColorMixBuffer, 0, totalObjects);
    let newTimeUInt8 = this.calcNewShaderTime(this.shaderLoop, this.colorMixDuration) >> 0;
    let counter = 0;

    for (let i = 0; i < totalObjects * 4; i += 4) {
      if (timerView[counter] >= this.colorMixDuration) {
        if (stateBuffer[counter] == this.emptyCode) {
          // Prevent the color mix animation from starting over by setting the
          // start state equal to the end state.
          texArray[i] = texArray[i + 1];

          // Introduce random delay so that clumped state updates don't cause
          // clumped animations.
          timerView[counter] = -Math.random() * 2.5 * this.ticksPerSecond;
        } else {
          // Make the last end state the new start state.
          texArray[i] = texArray[i + 1];

          // Pop from the state buffer.
          texArray[i + 1] = stateBuffer[counter];
          stateBuffer[counter] = this.emptyCode;

          // Update the shader animation end time.
          texArray[i + 3] = newTimeUInt8;

          // Restart the JS timer.
          timerView[counter] = this.deltaTime * this.timescale;
        }
      } else {
        timerView[counter] += this.deltaTime * this.timescale;
      }
      counter++;
    }
  }

  tileIndexNoise(tempGrid, tempMaxIndex) {
    var index = 0;
    var width = tempGrid.parameters.columns;
    var height = tempGrid.parameters.rows;

    this.iteratorX = (this.iteratorX + 1) % (width + 1);
    if (this.iteratorX == width) {
      this.iteratorY = (this.iteratorY + 1) % height;
    }
    index = (this.iteratorX + this.iteratorY * width) % (tempMaxIndex + 1);
    return index;
  }

  calcNewShaderTime(currTime, addedTime) {
    let tempShaderLoop = 0;
    let newShaderLoop = currTime + addedTime;
    if (newShaderLoop >= 256.0) {
      tempShaderLoop = newShaderLoop - 256.0;
    } else {
      tempShaderLoop = newShaderLoop;
    }
    return tempShaderLoop;
  }

  // Call at the beginning of the draw loop to update timers.
  updateTimersDrawloopStart(time) {
    this.deltaTime = time - this.prevTime;
    if (this.deltaTime > 500) {
      this.deltaTime = 0; // Pause animations while minimized.
    } else {
      this.timer += this.deltaTime * this.timescale;
      this.shaderLoop = this.calcNewShaderTime(this.shaderLoop, this.deltaTime * this.timescale);
    }
  }

  // Call at the end of the draw loop to get a comparison value for deltaTime.
  updateTimersDrawloopEnd(time) {
    this.prevTime = time;
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

  // Returns a tile index given an x position and y position. Invalid if out of
  // boundaries or, if tiles are treated as circular, outside of the radius.
  getTileIndex(tempXPos, tempYPos, treatAsCircular) {
    let xPosGrid = Math.floor((tempXPos - this.parameters.marginX) / this.parameters.tileSize);
    let yPosGrid = Math.floor((tempYPos - this.parameters.marginY) / this.parameters.tileSize);
    let tempIndex = xPosGrid + yPosGrid * this.parameters.columns;

    let index = 0;
    if (xPosGrid < 0 || this.parameters.columns <= xPosGrid || yPosGrid < 0 || this.parameters.activeTiles <= tempIndex) {
      index = "invalid";
    } else if (treatAsCircular) {
      // Use a distance formula test from input coords to center of tile:
      // greater than radius means the user missed.
      let radius = this.parameters.tileSize * (1 - this.parameters.padding) / 2;
      let centerX = this.parameters.marginX + this.parameters.tileSize / 2 + xPosGrid * this.parameters.tileSize;
      let centerY = this.parameters.marginY + this.parameters.tileSize / 2 + yPosGrid * this.parameters.tileSize;
      let centerDistance = Math.sqrt(Math.pow(tempXPos - centerX, 2) + Math.pow(tempYPos - centerY, 2));
      if (centerDistance > radius) {
        index = "invalid";
      } else {
        index = xPosGrid + yPosGrid * this.parameters.columns;
      }
    } else {
      index = xPosGrid + yPosGrid * this.parameters.columns;
    }
    return index;
  }

  // Returns a tile index given an x position and y position. The coordinate
  // system will be looped as necessary so that no input can be invalid.
  getTileIndexLooped(tempXPos, tempYPos) {

  }
}

class ColorTheme {
  constructor(tempThemeName) {
    this.theme = this.setColorTheme(tempThemeName);
  }

  // Selects from predefined, user defined, or randomized themes and translates
  // them into a format usable by the fragment_texture shader. The resulting
  // array needs to be passed into the u_colortheme uniform - which is used to
  // match each color to its state code.
  setColorTheme(themeSelection) {
    // themeArray[0, 1, 2] = background
    // themeArray[3, 4, 5] = available
    // themeArray[6, 7, 8] = previewingTask
    // themeArray[9, 10, 11] = onCall
    // themeArray[12, 13, 14] = afterCall
    // themeArray[15, 16, 17] = loggedOut
    let themeArray = [];
    switch (themeSelection) {
      case "User":
        // Values from CSS color picker go here.
        break;
      case "RandomHSV":
        themeArray = this.randomThemeArray(Math.random(), 6);
        break;
      case "RandomRGB":
        let runningAverage = [0, 0, 0];
        for (let i = 0; i < 6 * 3; i += 3) {
          themeArray[i] = 255 * Math.random();
          themeArray[i + 1] = 255 * Math.random();
          themeArray[i + 2] = 255 * Math.random();
          runningAverage[0] += themeArray[i];
          runningAverage[1] += themeArray[i + 1];
          runningAverage[2] += themeArray[i + 2];
        }
        runningAverage = [runningAverage[0] / 6, runningAverage[1] / 6, runningAverage[2] / 6];
        [themeArray[0], themeArray[1], themeArray[2]] = [0.3 * runningAverage[0], 0.3 * runningAverage[1], 0.3 * runningAverage[2]]
        break;
      case "American":
        themeArray = [40, 40, 48, 98, 96, 162, 87, 153, 226, 215, 70, 88, 40, 73, 250, 230, 220, 230];
        break;
      default:
        themeArray = [0, 0, 0, 63, 191, 177, 0, 110, 184, 243, 108, 82, 255, 205, 52, 0, 48, 70]; // Theme from the client's slide.
        break;
    }

    document.body.style.backgroundColor = "rgb(" + themeArray[0] + ","
      + themeArray[1] + "," + themeArray[2] + ")";

    let consoleTheme = themeArray;
    for (let i = 0; i < themeArray.length; i++) {
      consoleTheme[i] = consoleTheme[i] >> 0;
    }

    // Normalize colors: the shader uses colors whose channels go from 0 to 1.
    for (let i = 0; i < themeArray.length; i++) {
      themeArray[i] = themeArray[i] / 255;
    }
    return themeArray;
  }

  // Generates a theme given a starting HSV hue. 
  randomThemeArray(centerPoint, totalColors) {
    let tempColorArray = [];

    function pushColor(h, s, v) {
      h = Math.abs(Math.sin(0.5 * Math.PI * h));
      s = Math.abs(Math.sin(0.5 * Math.PI * s));
      v = Math.abs(Math.sin(0.5 * Math.PI * v));
      let tempBuffer = [].concat(...VisualAux.HSVtoRGB(h, s, v));
      tempColorArray.push(tempBuffer[0], tempBuffer[1], tempBuffer[2]);
    }

    function tunedValue(mean, deviation) {
      return mean + deviation * Math.sin(2 * Math.PI * Math.random());
    }

    let hueSpread = Math.random();
    for (let i = 0; i < totalColors; i++) {
      let randomHue = centerPoint + Math.sin(((2 * Math.PI / totalColors) * (i + hueSpread)));
      let randomSat = 0.6 + 0.4 * Math.sin(((2 * Math.PI / totalColors) * i));
      let randomVal = tunedValue(0.1 + i / totalColors, 0.1);
      pushColor(randomHue, randomSat, randomVal);
    }
    return tempColorArray;
  }

  // Gets the color associated with a state code and returns it in the 
  // rgb(r, g, b) format used by CSS.
  colorLookup(tempCode) {
    let tempColor;
    let tempColorArray = [];

    if (tempCode != null) {
      let arrayStart = (tempCode / 51) * 3;
      let arrayEnd = arrayStart + 3;
      tempColorArray = this.theme.slice(arrayStart, arrayEnd);
    }

    tempColor = "rgb(" + 255 * tempColorArray[0] + ","
      + 255 * tempColorArray[1] + "," + 255 * tempColorArray[2] + ");";

    return tempColor;
  }
}

// A collection of various functions that are useful for graphics and visualization.
class VisualAux {
  'use strict'
  constructor() {
    let sineLength = 3600;
    this.randomSeed = 0;
    this.sineArray = VisualAux.createSineArray(sineLength);
    this.sineScale = (180 / Math.PI) * sineLength;
  }

  // Uses the mulberry32 algorithm, which is faster than Math.random() while
  // still producing a decent distribution. 
  // https://github.com/skeeto/hash-prospector
  static randomFast(seed) {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  // Creates a lookup array for replacing the Math.sin function.
  static createSineArray(tempRes) {
    if (tempRes == null) {
      tempRes = 360;
    }
    let tempSineArray = new Float32Array(0, tempRes);
    let tempScale = (2 * Math.PI) / tempRes;
    for (let i = 0; i < tempRes - 1; i++) {
      tempSineArray[i] = Math.sin(i * tempScale);
    }
    return tempSineArray;
  }

  // Uses a non-periodic sum of sinusoids for smooth noise generation.
  sineNoise(inputA, inputB, offsetA, offsetB) {
    var modLength = this.sineArray.length;
    var cycle_2 = (this.sineScale * (2 * inputA + offsetA)) % modLength;
    var cycle_PI = (this.sineScale * (Math.PI * inputB + offsetB)) % modLength;
    var sineNormal = 0.25 * (2.0 + this.sineArray[cycle_2 >> 0] + this.sineArray[cycle_PI >> 0]);
    return sineNormal;
  }

  // Creates a transformation matrix for scaling our quad's vertices. Needed to
  // preserve the aspect ratio of the tiles within the shader. It also flips the
  // texture so that circles maintain a proper ordering. 
  // https://stackoverflow.com/questions/52507592/how-to-scale-a-texture-in-webgl
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

  static HSVtoRGB(h, s, v) {
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
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
}

setup();
