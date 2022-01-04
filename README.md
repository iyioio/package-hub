# package-hub
A tool to simplify package sharing in mono-repos and packages outside of a project's root directory

## What does package-hub do?
Package-hub allows you to define a collection of source npm package directories and mount them
into target projects.

For example, say you have a React website and 2 supporting npm library packages that live out side of
the root the main website. You could use package-hub to link the 2 supporting libraries as 
node_modules. While the libraries are linked you can both the main website and the supporting
libraries with support for hot-reloading and code navigation.

## Example

### Using packagehub-config.json
This example uses a configuration file to build a script the 


pkhub-config.json
``` json
{
    "verbose":true,
    "deleteCache":true,
    "hubs":[
        "."
    ],
    "targets":[
        "./example/cool-web-site/"
    ],
    "use":[
        "@iyio/example-project-math",
        "@iyio/example-project-strings"
    ],
    "args":[

    ]
}
```

``` sh
npx pkhub
```


### Using cli arguments
This example uses cli arguments as a script to run a package-hub
``` sh
npx pkhub -verbose -delete-cache \
    -hub ./example \
    -target ./example/cool-web-site/ \
    -use @iyio/example-project-math @iyio/example-project-strings
```


## Hubs

Hubs define the location of packages

``` json
{
    "packages":[
        {
            "path":"packages/math"
        },
        {
            "path":"packages/strings"
        }
    ]
}
```