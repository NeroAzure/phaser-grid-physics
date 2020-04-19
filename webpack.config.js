'use strict';

module.exports = {
    mode: 'production',
    watch: false,
    context: `${__dirname}/src/`,
    entry: {
        GridPhysics: './main.js',
        'GridPhysics.min': './main.js'
    },

    output: {
        path: `${__dirname}/dist/`,
        filename: '[name].js',
        library: 'GridPhysics',
        libraryTarget: 'umd',
        umdNamedDefine: true
    },

    module: {
        rules: [{
            test: /\.js$/, // Check for all js files
            exclude: /node_modules/,
            use: [{
                loader: 'babel-loader',
                options: {
                    presets: ['es2015']
                }
            }]
        }]
    },
    optimization: {
        minimize: false // Let Uglify do this job for min-build only
    }
};