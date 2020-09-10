"use strict";

var vs = `#version 300 es

in vec4 a_position;
in vec4 a_color;
in vec2 a_texcoord;
in vec3 a_normal;

uniform vec3 u_lightWorldPosition;
uniform vec3 u_viewWorldPosition;

uniform mat4 u_world;
uniform mat4 u_worldViewProjection;
uniform mat4 u_worldInverseTranspose;

out vec4 v_color;
out vec2 v_texcoord;
out vec3 v_normal;
out vec3 v_surfaceToLight;
out vec3 v_surfaceToView;

void main() {
  // Multiply the position by the matrix.
  gl_Position = u_worldViewProjection * a_position;

  // Pass the color to the fragment shader.
  v_color = a_color;
  v_texcoord = a_texcoord;

  v_normal = mat3(u_worldInverseTranspose) * a_normal;

  vec3 surfaceWorldPosition = (u_world * a_position).xyz;

  v_surfaceToLight = u_lightWorldPosition - surfaceWorldPosition;

  v_surfaceToView = u_viewWorldPosition - surfaceWorldPosition;
}
`;

var fs = `#version 300 es
precision highp float;

// Passed in from the vertex shader.
in vec4 v_color;
in vec2 v_texcoord;
in vec3 v_normal;
in vec3 v_surfaceToLight;
in vec3 v_surfaceToView;


uniform sampler2D u_texture;
uniform float u_shininess;
uniform vec3 u_lightColor;
uniform vec3 u_specularColor;
uniform float u_ambience;
uniform float u_diffuse;
uniform float u_specular;
uniform float u_brightness;

out vec4 outColor;

void main() {
   // outColor = v_color * u_colorMult;
  vec4 color = texture(u_texture, v_texcoord);

  vec3 normal = normalize(v_normal);

  vec3 surfaceToLightDirection = normalize(v_surfaceToLight);
  vec3 surfaceToViewDirection = normalize(v_surfaceToView);
  vec3 halfVector = normalize(surfaceToLightDirection + surfaceToViewDirection);

  // compute the light by taking the dot product
  // of the normal to the light's reverse direction

  float light;
  float specular;
  
  light = max(0.0,dot(normal, surfaceToLightDirection));
  specular = 0.0;
  if (light > 0.0) {
      specular = pow(dot(normal, halfVector), u_shininess);
  }
  outColor.rgb += u_diffuse * u_brightness * light * color.rgb * u_lightColor;
  outColor.rgb += u_specular * u_brightness * specular * color.rgb * u_specularColor;
  
  outColor.rgb += u_ambience * 1.0 * color.rgb;
  outColor.a = 1.0;
}
`;

var vslines = `#version 300 es

in vec4 a_position;
// in vec4 a_color;

uniform mat4 u_matrix;


// out vec4 v_color;

void main() {
  // Multiply the position by the matrix.
  gl_Position = u_matrix * a_position;
  // gl_Position.z = gl_Position.z * 0.5;
  // Pass the color to the fragment shader.
  // v_color = a_color;
  // v_texcoord = a_texcoord;

}
`;

var fslines = `#version 300 es
precision highp float;

// Passed in from the vertex shader.
// in vec4 v_color;
// in vec2 v_texcoord;

uniform vec4 u_color;


out vec4 outColor;

void main() {
  // outColor = v_color * u_colorMult;
  outColor = u_color;
}
`;

async function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  var canvas = document.querySelector("#canvas");
  var gl = canvas.getContext("webgl2");
  if (!gl) {
    return;
  }
  var configGui = {
    dia: 1,
    latitude: 0,
    longitude: 0,
    animate: false,
    velocity: "50"
  }

  const gui = new dat.GUI();

  gui.add(configGui, "dia", 1,51,1).onChange(drawScene).listen();
  gui.add(configGui, "latitude", -90,90,1).onChange(drawScene).listen();
  gui.add(configGui, "longitude", -180,180,1).onChange(drawScene).listen();
  gui.add(configGui, "animate").onChange(drawScene).listen();
  gui.add(configGui, "velocity").onChange(drawScene).listen();
  


  var isMouseDown = false;
  var dragX, dragY, dragLat, dragLng;
  var deltaTime;
  var then = 0;
  var lastLong = 0;
  
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
 
  function onMouseDown(evt) {
    isMouseDown = true;
    dragX = evt.pageX;
    dragY = evt.pageY;
    dragLat = configGui.latitude;
    dragLng = configGui.longitude;
  }

  function onMouseMove(evt) {
    if(isMouseDown) {
        var dX = evt.pageX - dragX;
        var dY = evt.pageY - dragY;
        // console.log(dX,dY);
        configGui.latitude = clamp(dragLat + dY * 0.5, -90, 90);
        configGui.longitude = clampLng(dragLng - dX * 0.5, -180, 180);
    }
  } 

  function onMouseUp(evt) {
    if(isMouseDown) {
        isMouseDown = false;
    }
  }
  // Tell the twgl to match position with a_position, n
  // normal with a_normal etc..
  twgl.setAttributePrefix("a_");

  var sphereBufferInfo = flattenedPrimitives.createSphereBufferInfo(gl, 20, 48, 48);
  var arrays = {
    position: { numComponents: 3, data: [0, 0, 0, 0, 0, 21] },
  };
  var linesBufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

  // setup GLSL program
  var programInfo = twgl.createProgramInfo(gl, [vs, fs]);
  var programInfoLines = twgl.createProgramInfo(gl, [vslines, fslines]) ;

  var sphereVAO = twgl.createVAOFromBufferInfo(gl, programInfo, sphereBufferInfo);
  
  var linesVAO = twgl.createVAOFromBufferInfo(gl,programInfoLines, linesBufferInfo);

  function degToRad(d) {
    return d * Math.PI / 180;
  }

  var fieldOfViewRadians = degToRad(60);

  // var texture = twgl.createTexture(gl, {src = "/earthmap1k.jpg"}); 
  var texture = loadTexture("./world.jpg",gl);

  var light = {
    position: [0,0,50],
    color: [1,1,1],
    brightness: 1.0
  }

  // Uniforms for each object.
  var sphereUniforms = {
    u_colorMult: [0.5, 1, 0.5, 1],
    u_worldViewProjection: m4.identity(),
    u_texture: texture,
    u_lightWorldPosition: light.position,
    u_viewWorldPosition: [0,0,0],
    u_world: m4.identity(),
    u_worldInverseTranspose: m4.identity(),
    u_shininess: 50,
    u_lightColor: light.color,
    u_specularColor: light.color,
    u_ambience: 0.1,
    u_diffuse: 0.7,
    u_specular: 0.1,
    u_brightness: 1.0,
  };
  
  var linesUniforms = {
    u_matrix: m4.identity(),
    u_color: [1,0,0,1],
    u_deaths: 0
  };

  var sphereTranslation = [  0, 0, 0];


  var objectsToDraw = [
    {
      programInfo: programInfo,
      bufferInfo: sphereBufferInfo,
      vertexArray: sphereVAO,
      uniforms: sphereUniforms,
    },
    {
      programInfo: programInfoLines,
      bufferInfo: linesBufferInfo,
      vertexArray: linesVAO,
      uniforms: linesUniforms,
    },
  ];
 
  var dados;

  var promisse = d3.csv("covid_deaths.csv", function(d) {
    // console.log(d);
    return {
        lat: d.Lat,
        long: d.Long,
        d1_22: d.D1_22,
        d1_23: d.D1_23,
        d1_24: d.D1_24,
        d1_25: d.D1_25,
        d1_26: d.D1_26,
        d1_27: d.D1_27,
        d1_28: d.D1_28,
        d1_29: d.D1_29,
        d1_30: d.D1_30,
        d1_31: d.D1_31,
        d2_1: d.D2_1,
        d2_2: d.D2_2,
        d2_3: d.D2_3,
        d2_4: d.D2_4,
        d2_5: d.D2_5,
        d2_6: d.D2_6,
        d2_7: d.D2_7,
        d2_8: d.D2_8,
        d2_9: d.D2_9,
        d2_10: d.D2_10,
        d2_11: d.D2_11,
        d2_12: d.D2_12,
        d2_13: d.D2_13,
        d2_14: d.D2_14,
        d2_15: d.D2_15,
        d2_16: d.D2_16,
        d2_17: d.D2_17,
        d2_18: d.D2_18,
        d2_19: d.D2_19,
        d2_20: d.D2_20,
        d2_21: d.D2_21,
        d2_22: d.D2_22,
        d2_23: d.D2_23,
        d2_24: d.D2_24,
        d2_25: d.D2_25,
        d2_26: d.D2_26,
        d2_27: d.D2_27,
        d2_28: d.D2_28,
        d2_29: d.D2_29,
        d3_1: d.D3_1,
        d3_2: d.D3_2,
        d3_3: d.D3_3,
        d3_4: d.D3_4,
        d3_5: d.D3_5,
        d3_6: d.D3_6,
        d3_7: d.D3_7,
        d3_8: d.D3_8,
        d3_9: d.D3_9,
        d3_10: d.D3_10,
        d3_11: d.D3_11,
        d3_12: d.D3_12,
    }
  }).then(function(data){
    return data;
  });


  dados = await promisse;
  // console.log(dados.length);  

  function computeMatrix(viewProjectionMatrix, translation, xRotation, yRotation) {
    var matrix = m4.translate(viewProjectionMatrix,
        translation[0],
        translation[1],
        translation[2]);
    matrix = m4.xRotate(matrix, xRotation);
    return m4.yRotate(matrix, yRotation);
  }
  
  // console.log(dados[182-2]);
  
  // console.log(texture);
  requestAnimationFrame(drawScene);
  // drawScene();
  // Draw the scene.
  function drawScene(now) {
    now = now * 0.001;

    deltaTime = now - then;
    then = now;


    if(configGui.animate){
      configGui.longitude = clampLng(configGui.longitude - deltaTime*parseInt(configGui.velocity), -180, 180);
    }
    if(configGui.longitude * lastLong < 0 && lastLong < 20 && lastLong > -20){
      // console.log(configGui.longitude, lastLong);

      if(configGui.dia < 51){
        configGui.dia += 1
      }
    }
    lastLong = configGui.longitude;



    twgl.resizeCanvasToDisplaySize(gl.canvas);

    
    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);


    gl.clearColor(0 , 0, 0, 0);
    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    // Compute the projection matrix
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var projectionMatrix =
        m4.perspective(fieldOfViewRadians, aspect, 1, 2000);
    // var projectionMatrix =
    //     m4.orthographic(-20, 20, 20, -20, 1, 2000);

    // Compute the camera's matrix using look at.
    var cameraPosition = [0, 0, 40];
    var target = [0, 0, 0];
    var up = [0, 1, 0];
    var cameraMatrix = m4.lookAt(cameraPosition, target, up);

    // Make a view matrix from the camera matrix.
    var viewMatrix = m4.inverse(cameraMatrix);

    var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

    var sphereXRotation =  degToRad(configGui.latitude);
    var sphereYRotation =  degToRad(90 - configGui.longitude);
   

    var worldMatrix = m4.identity();
    worldMatrix = m4.translate(worldMatrix, sphereTranslation[0], sphereTranslation[1], sphereTranslation[2]);
    worldMatrix = m4.xRotate(worldMatrix, sphereXRotation);
    worldMatrix = m4.yRotate(worldMatrix, sphereYRotation);

    // Compute the matrices for each object.
    sphereUniforms.u_worldViewProjection = m4.multiply(viewProjectionMatrix, worldMatrix);
    
    var worldInverseMatrix = m4.inverse(worldMatrix);
    var worldInverseTransposeMatrix = m4.transpose(worldInverseMatrix);
    sphereUniforms.u_world = worldMatrix;
    sphereUniforms.u_worldInverseTranspose = worldInverseTransposeMatrix;
    sphereUniforms.u_viewWorldPosition = cameraPosition;
  
    // ------ Draw the objects --------

    var object = objectsToDraw[0];
    var programInfo = object.programInfo;

    gl.useProgram(programInfo.program);

    // Setup all the needed attributes.
    gl.bindVertexArray(object.vertexArray);

    // Set the uniforms we just computed
    twgl.setUniforms(programInfo, object.uniforms);

    // twgl.setTextureFromElement(gl, texture, canvas);
    
    twgl.drawBufferInfo(gl, object.bufferInfo);
    

    object = objectsToDraw[1];

    for(var i=0; i< dados.length;i++){
      // console.log(configGui.dia);
      // console.log(dados[i].D1_22);
      var deaths = dayDeaths(configGui.dia,i)
      if(deaths != 0){
        var programInfo = object.programInfo;

        gl.useProgram(programInfo.program);

        // Setup all the needed attributes.
        gl.bindVertexArray(object.vertexArray);

        // console.log(dados[i].lat);
        // console.log(dados[i].long);

        // Set the uniforms we just computed
        // latitude invertida
        linesUniforms.u_matrix = computeMatrix(
          viewProjectionMatrix,
          [0,0,0],
          degToRad(-dados[i].lat + configGui.latitude),
          degToRad(dados[i].long - configGui.longitude),
          deaths
        );  
        if(deaths < 10){
          linesUniforms.u_color = [0,1,0,1];
        } else if(deaths < 100){
          linesUniforms.u_color = [0,1,1,1];
        } else if(deaths < 1000){
          linesUniforms.u_color = [0,0,1,1];
        } else {
          linesUniforms.u_color = [1,0,0,1];
        }


        twgl.setUniforms(programInfo, object.uniforms);

        // twgl.setTextureFromElement(gl, texture, canvas);
        if(programInfo === programInfoLines){
          twgl.drawBufferInfo(gl, object.bufferInfo, gl.LINES);
        }
        else{
          twgl.drawBufferInfo(gl, object.bufferInfo);
        }
      } 
    }
    requestAnimationFrame(drawScene);
  }

  function radToDeg(r) {
    return r * 180 / Math.PI;
  }

  function degToRad(d) {
    return d * Math.PI / 180;
  }

  function clamp(x, min, max) {
    return x < min ? min : x > max ? max : x;
  }
  function clampLng(lng) {
    // % = resto da div
    if (lng < 0){
      return ((lng - 180) % 360) + 180;
    }
    return ((lng + 180) % 360) - 180;

  }
  function dayDeaths(day,i){
    switch (day){
      case 1:
        return dados[i].d1_22;
        break;
      case 2:
        return dados[i].d1_23;
        break;
      case 3:
        return dados[i].d1_24;
        break;
      case 4:
        return dados[i].d1_25;
        break;  
      case 5:
        return dados[i].d1_26;
        break;
      case 6:
        return dados[i].d1_27;
        break;
      case 7:
        return dados[i].d1_28;
        break;
      case 8:
        return dados[i].d1_29;
        break;  
      case 9:
        return dados[i].d1_30;
        break;
      case 10:
        return dados[i].d1_31;
        break;
      case 11:
        return dados[i].d2_1;
        break;
      case 12:
        return dados[i].d2_2;
        break;  
      case 13:
        return dados[i].d2_3;
        break;
      case 14:
        return dados[i].d2_4;
        break;
      case 15:
        return dados[i].d2_5;
        break;
      case 16:
        return dados[i].d2_6;
        break;      
      case 17:
        return dados[i].d2_7;
        break;
      case 18:
        return dados[i].d2_8;
        break;
      case 19:
        return dados[i].d2_9;
        break; 
      case 20:
        return dados[i].d2_10;
        break;  
      case 21:
        return dados[i].d2_11;
        break;  
      case 22:
        return dados[i].d2_12;
        break;  
      case 23:
        return dados[i].d2_13;
        break;  
      case 24:
        return dados[i].d2_14;
        break;  
      case 25:
        return dados[i].d2_15;
        break;  
      case 26:
        return dados[i].d2_16;
        break;  
      case 27:
        return dados[i].d2_17;
        break;  
      case 28:
        return dados[i].d2_18;
        break;  
      case 29:
        return dados[i].d2_19;
        break;  
      case 30:
        return dados[i].d2_20;
        break;  
      case 31:
        return dados[i].d2_21;
        break; 
      case 32:
        return dados[i].d2_22;
        break; 
      case 33:
        return dados[i].d2_23;
        break; 
      case 34:
        return dados[i].d2_24;
        break; 
      case 35:
        return dados[i].d2_25;
        break; 
      case 36:
        return dados[i].d2_26;
        break; 
      case 37:
        return dados[i].d2_27;
        break; 
      case 38:
        return dados[i].d2_28;
        break; 
      case 39:
        return dados[i].d2_29;
        break; 
      case 40:
        return dados[i].d3_1;
        break; 
      case 41:
        return dados[i].d3_2;
        break; 
      case 42:
        return dados[i].d3_3;
        break; 
      case 43:
        return dados[i].d3_4;
        break; 
      case 44:
        return dados[i].d3_5;
        break; 
      case 45:
        return dados[i].d3_6;
        break; 
      case 46:
        return dados[i].d3_7;
        break; 
      case 47:
        return dados[i].d3_8;
        break; 
      case 48:
        return dados[i].d3_9;
        break; 
      case 49:
        return dados[i].d3_10;
        break; 
      case 50:
        return dados[i].d3_11;
        break; 
      case 51:
        return dados[i].d3_12;
        break; 

                     
    }
  }
}
function loadTexture(url,gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
  
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixel);
  
    const image = new Image();
    image.onload = function() {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    };
    image.src = url;
  
    return texture;
  }

main();
