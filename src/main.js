import * as PIXI from 'pixi.js';
import MiniSignal from 'mini-signals';

const rectShaderFrag = `
varying vec2 vTextureCoord;
varying vec4 vFrame;
varying float vTextureId;
uniform vec4 shadowColor;
uniform sampler2D uSamplers[%count%];
uniform vec2 uSamplerSize[%count%];

void main(void){
  vec2 textureCoord = clamp(vTextureCoord, vFrame.xy, vFrame.zw);
  float textureId = floor(vTextureId + 0.5);

  vec4 color;
  %forloop%
  gl_FragColor = color;
}`;

const rectShaderVert = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
attribute vec4 aFrame;
attribute vec2 aAnim;
attribute float aTextureId;

uniform mat3 projectionMatrix;
uniform vec2 animationFrame;

varying vec2 vTextureCoord;
varying float vTextureId;
varying vec4 vFrame;

void main(void){
  gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
  vec2 anim = aAnim * animationFrame;
  vTextureCoord = aTextureCoord + anim;
  vFrame = aFrame + vec4(anim, anim);
  vTextureId = aTextureId;
}`;

const generateFragmentSrc = (maxTextures, fragmentSrc) => {
  return fragmentSrc.replace(/%count%/gi, maxTextures + "")
    .replace(/%forloop%/gi, this.generateSampleSrc(maxTextures));
}

const generateSampleSrc = (maxTextures) => {
  let src = '';

  src += '\n';
  src += '\n';

  src += 'if(vTextureId <= -1.0) {';
  src += '\n\tcolor = shadowColor;';
  src += '\n}';

  for(let i = 0; i < maxTextures; i++){
    src += '\nelse ';

    if(i < maxTextures-1){
        src += 'if(textureId == ' + i + '.0)';
    }

    src += '\n{';
    src += '\n\tcolor = texture2D(uSamplers['+i+'], textureCoord * uSamplerSize['+i+']);';
    src += '\n}';
  }

  src += '\n';
  src += '\n';

  return src;
}

const fillSamplers = (shader, maxTextures)=>{
  const sampleValues = [];
  for (let i = 0; i < maxTextures; i++){
    sampleValues[i] = i;
  }
  shader.bind();
  shader.uniforms.uSamplers = sampleValues;

  const samplerSize = [];
  for (i = 0; i < maxTextures; i++) {
      samplerSize.push(1.0 / 2048);
      samplerSize.push(1.0 / 2048);
  }
  shader.uniforms.uSamplerSize = samplerSize;
}

class TileShader extends PIXI.Shader{
  maxTextures = 0;
  indexBuffer = null;

  constructor(gl, maxTextures, vert, frag, ){
    super(gl, vert, frag);
    this.maxTextures = maxTextures;
    fillSamplers(this, this.maxTextures);
  }
}

class RectTileShader extends TileShader{
  vertSize = 11;
  vertPerQuad = 4;
  stride = this.vertSize * 4;
  
  constructor(gl, maxTextures) {
    super(gl,
      maxTextures,
      rectShaderVert,
      generateFragmentSrc(maxTextures, rectShaderFrag)
    );
    fillSamplers(this, this.maxTextures);
  }

  createVao(renderer, vb) {
    const gl = renderer.gl;
    return renderer.createVao()
      .addIndex(this.indexBuffer)
      .addAttribute(vb, this.attributes.aVertexPosition, gl.FLOAT, false, this.stride, 0)
      .addAttribute(vb, this.attributes.aTextureCoord, gl.FLOAT, false, this.stride, 2 * 4)
      .addAttribute(vb, this.attributes.aFrame, gl.FLOAT, false, this.stride, 4 * 4)
      .addAttribute(vb, this.attributes.aAnim, gl.FLOAT, false, this.stride, 8 * 4)
      .addAttribute(vb, this.attributes.aTextureId, gl.FLOAT, false, this.stride, 10 * 4);
  }
}

class TileRenderer extends PIXI.ObjectRenderer{
  constructor(renderer) {
    super(renderer);
  }
}

export default class Main extends PIXI.Container{

  loader = null;

  constructor(){
    super();
    document.addEventListener("DOMContentLoaded", e=> {
      console.log("DOM loaded...");
      this.init();
      this.renderer = PIXI.autoDetectRenderer(window.innerWidth, window.innerHeight);
      this.renderer.backgroundColor = 0x222222;
      document.body.appendChild(this.renderer.view);
      this.renderer.render(this);
    });
  }

  init(){
    const mapName = this.mapName = 'megalul';
    this.loadMap(mapName);
  }

  loadMap(mapName){
    const loader = this.loader = new PIXI.loaders.Loader(); 
    this.resources = loader.resources;
    loader.baseUrl = 'assets/';
    this._loadMapData(mapName)
    .then(this._initMap.bind(this))
    .then(this._loadTilesets.bind(this))
    .then(this._loadLayers.bind(this))
    ;

    // loader.add(mapName, `${mapName}.json`);
    // loader.load(this.onAssetsLoaded.bind(this));
  }

  _loadMapData(mapName, type = `json`){
    return new Promise((resolve, reject)=>{
      const loader = this.loader;
      loader.add(mapName, `${mapName}.${type}`);
      loader.load(loader=>{
        resolve(loader.resources[mapName].data);
      })
    });
  }

  _initMap(data){
    this.layers = data.layers;

    this.tilesets = data.tilesets;

    this.tilewidth = data.tilewidth;

    this.tileheight = data.tileheight;

    this.version = data.version;

    this.width = data.width;

    this.height = data.height;

    this.pixelWidth = data.width*data.tilewidth;

    this.pixelHeight = data.height*data.tileheight;

    return data;
  }

  _loadTilesets(data){
    return new Promise((resolve,reject)=>{
      const loader = this.loader;
      for(let i = 0; i < data.tilesets.length;i++){
        const tileset = data.tilesets[i];
        loader.add(tileset.name, tileset.image);  
      }
      loader.load(loader=>{
        resolve(data);
      })
    });
  }

  _loadLayers(data){
    const layers = data.layers;
    const x = 0;
    const row = [];
    const output = [];
    let rotation, flipped, flippedVal, gid;

    for(let layer of layers){
      console.log(layer);
      // for (var t = 0, len = curl.data.length; t < len; t++){
      //     rotation = 0;
      //     flipped = false;
      //     gid = layer.data[t];


      // }
    }
  }



  onAssetsLoaded(loader){
    const mapName = this.mapName;
    const mapData = loader.resources[mapName].data;
  }

  // update(t){
    // console.log(t);
  // }

}

window.main = new Main();
window.Main = Main;