// webpack.mix.js

let mix = require('laravel-mix');

mix
.js('resources/scripts/main.js', 'scripts')
.sass('resources/styles/main.scss', 'styles')
.setPublicPath('dist');