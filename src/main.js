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

const _hackSubImage = (tex, sprite)=> {
  var gl = tex.gl;
  var baseTex = sprite.texture.baseTexture;
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, sprite.position.x, sprite.position.y, tex.format, tex.type, baseTex.source);
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

  onContextChange() {
    const gl = this.renderer.gl;
    const maxTextures = this.maxTextures;
    this.rectShader = new RectTileShader(gl, maxTextures);
    this.checkIndexBuffer(2000);
    this.rectShader.indexBuffer = this.indexBuffer;
    this.vbs = {};
    this.glTextures = [];
    this.boundSprites = [];
    this.initBounds();
  }

  initBounds() {
    var gl = this.renderer.gl;
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = 2048;
    tempCanvas.height = 2048;
    // tempCanvas.getContext('2d').clearRect(0, 0, 2048, 2048);
    for (var i = 0; i < this.maxTextures; i++) {
      var rt = PIXI.RenderTexture.create(2048, 2048);
      rt.baseTexture.premultipliedAlpha = true;
      rt.baseTexture.scaleMode = TileRenderer.SCALE_MODE;
      rt.baseTexture.wrapMode = PIXI.WRAP_MODES.CLAMP;
      this.renderer.textureManager.updateTexture(rt);

      this.glTextures.push(rt);
      var bs = [];
      for (var j = 0; j < 4; j++) {
        var spr = new PIXI.Sprite();
        spr.position.x = 1024 * (j & 1);
        spr.position.y = 1024 * (j >> 1);
        bs.push(spr);
      }
      this.boundSprites.push(bs);
    }
  }

  bindTextures(renderer, shader, textures) {
    var bounds = this.boundSprites;
    var glts = this.glTextures;
    var len = textures.length;
    var maxTextures = this.maxTextures;
    if (len >= 4 * maxTextures) {
      return;
    }
    var i;
    for (i = 0; i < len; i++) {
      var texture = textures[i];
      if (!texture || !textures[i].valid) continue;
      var bs = bounds[i >> 2][i & 3];
      if (!bs.texture ||
        bs.texture.baseTexture !== texture.baseTexture) {
        bs.texture = texture;
        var glt = glts[i >> 2];
        renderer.bindTexture(glt);
        _hackSubImage((glt.baseTexture)._glTextures[renderer.CONTEXT_UID], bs);
      }
    }
    this.texLoc.length = 0;
    for (i = 0; i < maxTextures; i++) {
      this.texLoc.push(renderer.bindTexture(glts[i]))
    }
    shader.uniforms.uSamplers = this.texLoc;
  }

  start() {
    this.renderer.state.setBlendMode(PIXI.BLEND_MODES.NORMAL);
    //sorry, nothing
  }

  getVb(id) {
    this.checkLeaks();
    var vb = this.vbs[id];
    if (vb) {
      vb.lastAccessTime = Date.now();
      return vb;
    }
    return null;
  }

  createVb() {
    var id = ++TileRenderer.vbAutoincrement;
    var shader = this.getShader();
    var gl = this.renderer.gl;
    var vb = PIXI.glCore.GLBuffer.createVertexBuffer(gl, null, gl.STREAM_DRAW);
    var stuff = {
        id: id,
        vb: vb,
        vao: shader.createVao(this.renderer, vb),
        lastTimeAccess: Date.now(),
        shader: shader
    };
    this.vbs[id] = stuff;
    return stuff;
  }

  removeVb(id) {
    if (this.vbs[id]) {
      this.vbs[id].vb.destroy();
      this.vbs[id].vao.destroy();
      delete this.vbs[id];
    }
  }

  checkIndexBuffer(size) {
    // the total number of indices in our array, there are 6 points per quad.
    var totalIndices = size * 6;
    var indices = this.indices;
    if (totalIndices <= indices.length) {
      return;
    }
    var len = indices.length || totalIndices;
    while (len < totalIndices) {
      len <<= 1;
    }

    indices = new Uint16Array(len);
    this.indices = indices;

    // fill the indices with the quads to draw
    for (var i = 0, j = 0; i + 5 < indices.length; i += 6, j += 4) {
      indices[i + 0] = j + 0;
      indices[i + 1] = j + 1;
      indices[i + 2] = j + 2;
      indices[i + 3] = j + 0;
      indices[i + 4] = j + 2;
      indices[i + 5] = j + 3;
    }

    if (this.indexBuffer) {
      this.indexBuffer.upload(indices);
    } else {
      var gl = this.renderer.gl;
      this.indexBuffer = glCore.GLBuffer.createIndexBuffer(gl, this.indices, gl.STATIC_DRAW);
    }
  }

  getShader(){
    return thos.rectShader;
  }

  destroy() {
    super.destroy();
    this.rectShader.destroy();
    this.rectShader = null;
  };
}

PIXI.WebGLRenderer.registerPlugin('tilemap', TileRenderer);

class RectTileLayer extends PIXI.Container {
  constructor(zIndex, texture) {
    super();
    this.initialize(zIndex, texture);
  }

  textures;
  z = 0;
  zIndex = 0;
  pointsBuf = [];
  _tempSize = new Float32Array([0, 0]);
  _tempTexSize = 1;
  modificationMarker = 0;
  hasAnim = false;

  initialize(zIndex, textures) {
    if (!textures) {
      textures = [];
    } else if (!(textures instanceof Array) && (textures).baseTexture) {
      textures = [textures];
    }
    this.textures = textures;
    this.z = this.zIndex = zIndex;
    this.visible = false;
  }

  clear() {
    this.pointsBuf.length = 0;
    this.modificationMarker = 0;
    this.hasAnim = false;
  }

  addRect(textureId, u, v, x, y, tileWidth, tileHeight, animX = 0, animY = 0) {
    var pb = this.pointsBuf;
    this.hasAnim = this.hasAnim || animX > 0 || animY > 0;
    if (tileWidth == tileHeight) {
      pb.push(u);
      pb.push(v);
      pb.push(x);
      pb.push(y);
      pb.push(tileWidth);
      pb.push(tileHeight);
      pb.push(animX | 0);
      pb.push(animY | 0);
      pb.push(textureId);
    } else {
      var i;
      if (tileWidth % tileHeight === 0) {
        //horizontal line on squares
        for (i = 0; i < tileWidth / tileHeight; i++) {
          pb.push(u + i * tileHeight);
          pb.push(v);
          pb.push(x + i * tileHeight);
          pb.push(y);
          pb.push(tileHeight);
          pb.push(tileHeight);
          pb.push(animX | 0);
          pb.push(animY | 0);
          pb.push(textureId);
        }
      } else if (tileHeight % tileWidth === 0) {
        //vertical line on squares
        for (i = 0; i < tileHeight / tileWidth; i++) {
          pb.push(u);
          pb.push(v + i * tileWidth);
          pb.push(x);
          pb.push(y + i * tileWidth);
          pb.push(tileWidth);
          pb.push(tileWidth);
          pb.push(animX | 0);
          pb.push(animY | 0);
          pb.push(textureId);
        }
      } else {
        //ok, ok, lets use rectangle. but its not working with square shader yet
        pb.push(u);
        pb.push(v);
        pb.push(x);
        pb.push(y);
        pb.push(tileWidth);
        pb.push(tileHeight);
        pb.push(animX | 0);
        pb.push(animY | 0);
        pb.push(textureId);
      }
    }
  };

  vbId = 0;
  vbBuffer = null;
  vbArray = null;
  vbInts = null;

  renderWebGL(renderer) {
    var points = this.pointsBuf;
    if (points.length === 0) return;
    var rectsCount = points.length / 9;
    var tile = renderer.plugins.tilemap;
    var gl = renderer.gl;
    tile.checkIndexBuffer(rectsCount);

    var shader = tile.getShader();
    var textures = this.textures;
    if (textures.length === 0) return;
    var len = textures.length;
    if (this._tempTexSize < shader.maxTextures) {
      this._tempTexSize = shader.maxTextures;
      this._tempSize = new Float32Array(2 * shader.maxTextures);
    }
    // var samplerSize = this._tempSize;
    for (var i = 0; i < len; i++) {
      if (!textures[i] || !textures[i].valid) return;
      var texture = textures[i].baseTexture;
      // samplerSize[i * 2] = 1.0 / texture.width;
      // samplerSize[i * 2 + 1] = 1.0 / texture.height;
    }
    tile.bindTextures(renderer, shader, textures);
    // shader.uniforms.uSamplerSize = samplerSize;
    //lost context! recover!
    var vb = tile.getVb(this.vbId);
    if (!vb) {
      vb = tile.createVb();
      this.vbId = vb.id;
      this.vbBuffer = null;
      this.modificationMarker = 0;
    }
    var vao = vb.vao;
    renderer.bindVao(vao);
    var vertexBuf = vb.vb;
    //if layer was changed, re-upload vertices
    vertexBuf.bind();
    var vertices = rectsCount * shader.vertPerQuad;
    if (vertices === 0) return;
    if (this.modificationMarker != vertices) {
      this.modificationMarker = vertices;
      var vs = shader.stride * vertices;
      if (!this.vbBuffer || this.vbBuffer.byteLength < vs) {
        //!@#$ happens, need resize
        var bk = shader.stride;
        while (bk < vs) {
          bk *= 2;
        }
        this.vbBuffer = new ArrayBuffer(bk);
        this.vbArray = new Float32Array(this.vbBuffer);
        this.vbInts = new Uint32Array(this.vbBuffer);
        vertexBuf.upload(this.vbBuffer, 0, true);
      }

      var arr = this.vbArray, ints = this.vbInts;
      //upload vertices!
      var sz = 0;
      //var tint = 0xffffffff;
      var textureId, shiftU, shiftV;
      //var tint = 0xffffffff;
      var tint = -1;
      for (i = 0; i < points.length; i += 9) {
        var eps = 0.5;
        textureId = (points[i + 8] >> 2);
        shiftU = 1024 * (points[i + 8] & 1);
        shiftV = 1024 * ((points[i + 8] >> 1) & 1);
        var x = points[i + 2], y = points[i + 3];
        var w = points[i + 4], h = points[i + 5];
        var u = points[i] + shiftU, v = points[i + 1] + shiftV;
        var animX = points[i + 6], animY = points[i + 7];
        arr[sz++] = x;
        arr[sz++] = y;
        arr[sz++] = u;
        arr[sz++] = v;
        arr[sz++] = u + eps;
        arr[sz++] = v + eps;
        arr[sz++] = u + w - eps;
        arr[sz++] = v + h - eps;
        arr[sz++] = animX;
        arr[sz++] = animY;
        arr[sz++] = textureId;
        arr[sz++] = x + w;
        arr[sz++] = y;
        arr[sz++] = u + w;
        arr[sz++] = v;
        arr[sz++] = u + eps;
        arr[sz++] = v + eps;
        arr[sz++] = u + w - eps;
        arr[sz++] = v + h - eps;
        arr[sz++] = animX;
        arr[sz++] = animY;
        arr[sz++] = textureId;
        arr[sz++] = x + w;
        arr[sz++] = y + h;
        arr[sz++] = u + w;
        arr[sz++] = v + h;
        arr[sz++] = u + eps;
        arr[sz++] = v + eps;
        arr[sz++] = u + w - eps;
        arr[sz++] = v + h - eps;
        arr[sz++] = animX;
        arr[sz++] = animY;
        arr[sz++] = textureId;
        arr[sz++] = x;
        arr[sz++] = y + h;
        arr[sz++] = u;
        arr[sz++] = v + h;
        arr[sz++] = u + eps;
        arr[sz++] = v + eps;
        arr[sz++] = u + w - eps;
        arr[sz++] = v + h - eps;
        arr[sz++] = animX;
        arr[sz++] = animY;
        arr[sz++] = textureId;
      }
      // if (vs > this.vbArray.length/2 ) {
      vertexBuf.upload(arr, 0, true);
      // } else {
      //     var view = arr.subarray(0, vs);
      //     vb.upload(view, 0);
      // }
    }
    gl.drawElements(gl.TRIANGLES, rectsCount * 6, gl.UNSIGNED_SHORT, 0);
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