#! /bin/bash

npm run build
npm publish --registry=https://registry.npmjs.org --access=public --scope=@tinysoft-sk
