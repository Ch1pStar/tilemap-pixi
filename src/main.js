import * as PIXI from 'pixi.js';
import MiniSignal from 'mini-signals';


class TileMapRenderer extends PIXI.ObjectRenderer{
  constructor(renderer) {
    super(renderer)
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
      this.renderer.backgroundColor = 0x333333;
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