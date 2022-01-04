#!/bin/bash

npx ts-node package-hub.ts -verbose -delete-cache \
    -hub ../example \
    -target ../example/cool-web-site/ \
    -use @iyio/example-project-math @iyio/example-project-strings