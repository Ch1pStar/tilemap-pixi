const path      = require('path');
const fs        = require('fs');
// const webpack   = require('webpack');
// 
const pkg       = require('./package.json');


const config = { pkg };

module.exports = {
  entry: __dirname+'/src/main.js',
  output: {
    path: __dirname + '/build',
    libraryTarget: 'umd',
    umdNamedDefine: true,
    filename: "bundle.js"
  },
  module: {
    loaders: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          loaders: [
              // {
              //   loader: 'babel-loader',
              //   query: {
              //     presets: ['es2015-lose'],
              //     cacheDirectory: true,

              //   }
              // },
              'babel-loader?cacheDirectory=true&presets[]=es2015&plugins[]=transform-class-properties',
              `preprocess?${JSON.stringify(config)}`,
          ],
        },
        {
            test: /\.(glsl|frag|vert)$/,
            exclude: /node_modules/,
            loaders: ['raw', 'glslify'],
        },
    ]
    // postLoaders: [
    //     {
    //         include: path.resolve(__dirname, 'node_modules/pixi.js'),
    //         loaders: ['transform?brfs']
    //     }
    // ],
  }

  // plugins: [
  //   // don't emit output when there are errors
  //   new webpack.NoErrorsPlugin(),
  // ],

};
