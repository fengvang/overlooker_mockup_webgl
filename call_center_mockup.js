var mouseX, mouseY;

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
  u_resolution: 0, u_gridparams: 0, u_colortheme: 0,
  u_texture_data: 0, u_texture_color: 0, u_matrix: 0,
};
const bufferInfo = twgl.createBufferInfoFromArrays(gl, glArrays);
twgl.setBuffersAndAttributes(gl, programInfoA, bufferInfo);
twgl.setBuffersAndAttributes(gl, programInfoB, bufferInfo);

function setup() {
  "use strict";
  let tempLayout, layout, animRate, prevTime, runTime, deltaTime;
  tempLayout = "default"; // Change to test layouts.

  switch (tempLayout) {
    case "growing":
      let startCount = 10;
      let endCount = 100000;
      let growthRate = 0.001;
      animRate = 3.0;
      uniforms.u_colortheme = setColorTheme("random");
      layout = new LayoutUsersJoin(startCount, endCount, growthRate);
      break;
    default:
      animRate = 3.0;
      uniforms.u_colortheme = setColorTheme("random");
      layout = new LayoutUsersStatic;
  }

  // Start draw loop:
  function render(time) {
    runTime = time * 0.001;
    deltaTime = runTime - prevTime;
    prevTime = runTime;

    // Resize if needed.
    if (twgl.resizeCanvasToDisplaySize(gl.canvas)) {
      layout.resized();
    }
    layout.updateUniforms();

    layout.display(deltaTime, animRate);
    requestAnimationFrame(render); // Repeat loop.
  }
  layout.updateUniforms();
  requestAnimationFrame(render); // Start loop.
}

class LayoutSimGrid {
  constructor() {
    let tempUserCount = 10000;
    let dotPadding = 0.1;
    let maxStateQueue = tempUserCount * 4;
    this.gridMain = new UserGrid(tempUserCount, gl.canvas.width, gl.canvas.height, dotPadding, "max");
    this.userSim = new UserSimulator(tempUserCount, maxStateQueue);
    this.texMain = new DataTexture(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    this.texMain.randomizeTimers();
  }

  updateUniforms() {
    uniforms.u_resolution = [gl.canvas.width, gl.canvas.height];
    uniforms.u_gridparams = [this.texMain.texWidth, this.texMain.texHeight, this.gridMain.parameters.padding];
    uniforms.u_timescale = 3.0;

    // spanHeight, spanWidth, stretch, preserve:
    uniforms.u_matrix = VisualAux.textureStretch(this.texMain.texWidth, this.texMain.texHeight, "stretch")
  }

  resized() {
    this.gridMain.resize(gl.canvas.width, gl.canvas.height);
    this.texMain.updateTextureDimensions(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
  }

  display(tempDeltaTime, tempAnimRate) {
    // Check to see if new dots have forced a resize:
    if (this.userSim.userCount > this.gridMain.parameters.tiles) {
      this.gridMain.addTiles(this.userSim.userCount, gl.canvas.width, gl.canvas.height);
      this.texMain.updateTextureDimensions(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    }
    this.userSim.setStateChanges(this.texMain.texArray);
    this.texMain.updateTexture();
    this.texMain.updateAnimations(tempDeltaTime, tempAnimRate);
    this.texMain.display();
  }
}

class LayoutUsersStatic extends LayoutSimGrid {
  constructor() {
    super();
    let tickInterval = 25;
    let updatesPerTick = this.userSim.userCount / 8;
    this.userStateProbArray = VisualAux.createProbabilityArray(0.2, 0.05, Object.keys(this.userSim.stateCodes).length - 1);

    // Start the UserSim clock:
    this.clientClock = setInterval(() => {
      for (let i = 0; i < updatesPerTick; i++) {
        var tempStateIndex = VisualAux.processProbabilityArray(this.userStateProbArray);
        var stateCodes = this.userSim.stateCodes;
        var tempState = Object.values(stateCodes)[tempStateIndex];
        if (tempState == null) {
          tempState = 51 * Math.floor(2.51 + 2.5 * Math.random());
        }
        this.userSim.setStateRandomUser(tempState);
      }

      if (this.userSim.stateUpdateQueue.length >= this.userSim.maxStateQueue) {
        this.userSim.setStateChanges(this.texMain); // The draw loop doesn't run while minimized, so use the clock to dequeue instead.
      }
    }, tickInterval);
  }
}

class LayoutUsersJoin extends LayoutSimGrid {
  constructor(tempStartCount, tempEndCount, tempGrowthRate) {
    super();
    this.startCount = tempStartCount;
    this.endCount = tempEndCount;
    this.growthRate = tempGrowthRate;
    let dotPadding = 0.1;
    let maxStateQueue = tempStartCount * 4;
    this.gridMain = new UserGrid(tempStartCount, gl.canvas.width, gl.canvas.height, dotPadding, "max");
    this.userSim = new UserSimulator(tempStartCount, maxStateQueue);
    this.texMain = new DataTexture(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
    this.texMain.randomizeTimers();

    let tickInterval = 25;
    let updatesPerTick = this.userSim.userCount / 8;
    this.userStateProbArray = VisualAux.createProbabilityArray(0.2, 0.05, Object.keys(this.userSim.stateCodes).length - 1);

    // State update clock:
    this.clientClock = setInterval(() => {
      for (let i = 0; i < updatesPerTick; i++) {
        var tempStateIndex = VisualAux.processProbabilityArray(this.userStateProbArray);
        var stateCodes = this.userSim.stateCodes;
        var tempState = Object.values(stateCodes)[tempStateIndex]; // Use random index to get a stateCode.
        if (tempState == null) {
          tempState = 51 * Math.floor(2.51 + 2.5 * Math.random());
        }
        this.userSim.setStateRandomUser(tempState);
      }

      for (let i = 0; i < this.userSim.userCount * this.growthRate; i++) {
        this.userSim.userJoin();
      }

      if (this.userSim.userCount > this.endCount) {
        let tempDotPadding = this.gridMain.parameters.padding;
        this.userSim.userCount = null;
        this.gridMain = null;
        this.texMain = null;
        this.gridMain = new UserGrid(this.startCount, gl.canvas.width, gl.canvas.height, tempDotPadding, "max");
        this.userSim = new UserSimulator(this.startCount, this.userSim.maxStateQueue);
        this.texMain = new DataTexture(this.gridMain.parameters.columns, this.gridMain.parameters.rows);
        for (let i = 0; i < this.startCount; i++)
          this.userSim.userJoin();
      }

      if (this.userSim.stateUpdateQueue.length >= this.userSim.maxStateQueue) {
        this.userSim.setStateChanges(this.texMain); // The draw loop doesn't run while minimized, so use the clock to dequeue instead.
      }
    }, tickInterval);
  }
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

  setStateRandomUser(stateCode) {
    // Use random noise function to select a user/texel/dot:
    var offset = this.stateChangeCounter / this.userCount;
    var userIndex = Math.floor(VisualAux.sineNoise(0, this.userCount - 1, 1, offset, offset));

    if (this.userArray[userIndex].connectionStatus == "online") {
      this.userArray[userIndex].currentState = stateCode;
      this.pushStateChange(this.getTextureIndex(userIndex), stateCode);
      this.stateChangeCounter++;
    }
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
    this.texelCount = this.texWidth * this.texHeight;
    this.texArray = new Uint8Array(this.texelCount * 4);
    this.colorTexture = this.createTexture(tempWidth, tempHeight, 0);
    this.dataTexture = this.createTexture(tempWidth, tempHeight, 1);
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
    for (let i = 0; i < this.texelCount * 4; i += 4) {
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
    var tempTexelCount = tempWidth * tempHeight;
    if (this.texelCount > tempTexelCount) {
      this.texArray = this.texArray.subarray(0, tempTexelCount * 4);
    } else {
      let tempBuffer = new ArrayBuffer(tempTexelCount * 4);
      new Uint8Array(tempBuffer).set(new Uint8Array(this.texArray));
      this.texArray = new Uint8Array(tempBuffer);
    }
    this.texWidth = tempWidth;
    this.texHeight = tempHeight;
    this.texelCount = tempTexelCount;
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
  constructor(tempTiles, canvasWidth, canvasHeight, tempPadding, tempSpanMode) {
    this.parameters = {
      tiles: tempTiles, tileSize: 0, width: 0, height: 0, rows: 0, columns: 0,
      padding: tempPadding, marginX: 0, marginY: 0, spanMode: tempSpanMode
    };
    this.updateTiling(tempSpanMode, canvasWidth, canvasHeight);
  }

  addTiles(tempTileCount, tempWidth, tempHeight) {
    let gridCapacity = this.parameters.columns * this.parameters.rows;
    if (tempTileCount > gridCapacity) {
      this.parameters.tiles = tempTileCount;
      this.updateTiling(this.parameters.spanMode, tempWidth, tempHeight);
    } else if (tempTileCount > this.parameters.tiles) {
      this.parameters.tiles = tempTileCount;
    } else {
      console.log("UserGrid.addTiles: parameters.tiles > tempTileCount.")
    }
  }

  removeTiles(tempTileCount, tempWidth, tempHeight) {
    let lowerBoundCapacity = this.parameters.columns * (this.parameters.rows - 1);
    if (tempTileCount <= lowerBoundCapacity) {
      this.parameters.tiles = tempTileCount;
      this.updateTiling(this.parameters.spanMode, tempWidth, tempHeight);
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
      default:
        paramsWidth = this.tilingSpanWidth(tempWidth, tempHeight);
        paramsHeight = this.tilingSpanHeight(tempWidth, tempHeight);
        if (paramsWidth.tileSize < paramsHeight.tileSize) {
          Object.assign(this.parameters, paramsHeight);
        } else {
          Object.assign(this.parameters, paramsWidth);
        }
    }
    this.parameters.marginX = (tempWidth - this.parameters.width) / 2;
    this.parameters.marginY = (tempHeight - this.parameters.height) / 2;
  }

  tilingSpanWidth(canvasWidth, canvasHeight) {
    let windowRatio = canvasWidth / canvasHeight;
    let cellWidth = Math.sqrt(this.parameters.tiles * windowRatio);

    let columnsW = Math.ceil(cellWidth);
    let rowsW = Math.ceil(this.parameters.tiles / columnsW);
    while (columnsW < rowsW * windowRatio) {
      columnsW++;
      rowsW = Math.ceil(this.parameters.tiles / columnsW);
    }
    let tileSizeW = canvasWidth / columnsW;

    let tempParameters = {
      rows: rowsW, columns: columnsW,
      tileSize: tileSizeW, width: canvasWidth,
      height: rowsW * tileSizeW,
    }

    return tempParameters;
  }

  tilingSpanHeight(canvasWidth, canvasHeight) {
    let windowRatio = canvasWidth / canvasHeight;
    let cellWidth = Math.sqrt(this.parameters.tiles * windowRatio);
    let cellHeight = this.parameters.tiles / cellWidth;

    let rowsH = Math.ceil(cellHeight);
    let columnsH = Math.ceil(this.parameters.tiles / rowsH);
    while (rowsH * windowRatio < columnsH) {
      rowsH++;
      columnsH = Math.ceil(this.parameters.tiles / rowsH);
    }
    let tileSizeH = canvasHeight / rowsH;

    let tempParameters = {
      rows: rowsH, columns: columnsH,
      tileSize: tileSizeH, width: columnsH * tileSizeH,
      height: canvasHeight,
    }

    return tempParameters;
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

setup();
