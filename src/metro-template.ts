import * as fs from 'fs';
import path from 'path';
import { parse } from 'comment-json';

export const metroConfigFile='metro.config.packagehub.js';

export type ExtraNodeModules={[name:string]:string}

export function createMetroTemplate(extraNodeModules:ExtraNodeModules)
{
    return `"use strict";

// this file is auto generated by @iyio/package-hub, changes will be overwritten
// https://github.com/iyioio/package-hub

/**
 * Extra mode modules defined by package-hub
 * @see https://github.com/iyioio/package-hub
 */
const extraNodeModules=${JSON.stringify(extraNodeModules,null,4)};

/**
 * Watch folders defined by package-hub
 * @see https://github.com/iyioio/package-hub
 */
const watchFolders=[];
for(const e in extraNodeModules){
    watchFolders.push(extraNodeModules[e]);
}

/**
 * Adds resolvers and watchFolders to a metro config and returns the passed in config
 * @param metroConfig A metro config object to add resolvers and watchers to
 * @returns The config file passed in
 * @see https://github.com/iyioio/package-hub
 */
function addPackageHubConfig(metroConfig)
{
    if(!metroConfig.resolver){
        metroConfig.resolver={}
    }
    if(!metroConfig.resolver.extraNodeModules){
        metroConfig.resolver.extraNodeModules={}
    }
    for(const e in extraNodeModules){
        metroConfig.resolver.extraNodeModules[e]=extraNodeModules[e];
    }

    if(!metroConfig.watchFolders){
        metroConfig.watchFolders=[];
    }
    for(const f of watchFolders){
        metroConfig.watchFolders.push(f);
    }

    return metroConfig;
}

module.exports = {
  extraNodeModules,
  watchFolders,
  addPackageHubConfig
};
`
}

const dataReg=/const\s+extraNodeModules\s*=(\{([^}]|\r|\n)*?\})/

export function addMetroPackage(metroConfigPath:string, name:string, distPath:string)
{
    const mods=loadExtraNodeModules(metroConfigPath);
    mods[name]=distPath;
    const tmpl=createMetroTemplate(mods);
    fs.writeFileSync(metroConfigPath,tmpl);
}

export function removeMetroPackage(metroConfigPath:string, name:string)
{
    const mods=loadExtraNodeModules(metroConfigPath);
    if(!mods[name]){
        return;
    }
    delete mods[name];
    const tmpl=createMetroTemplate(mods);
    fs.writeFileSync(metroConfigPath,tmpl);
}

export function loadExtraNodeModules(metroConfigPath:string):ExtraNodeModules
{
    try{
        if(!fs.existsSync(metroConfigPath)){
            return {}
        }
        const data=fs.readFileSync(metroConfigPath).toString();

        const match=dataReg.exec(data);
        if(!match?.[1]){
            return {};
        }

        return parse(match[1]);
    }catch(ex:any){
        console.warn('Failed to get extraNodeModules from '+metroConfigPath,ex);
        return {}
    }
}

export function initMetroTemplate(dir:string)
{
    const metroConfigPath=path.resolve(dir,metroConfigFile);
    const tmpl=createMetroTemplate({});
    fs.writeFileSync(metroConfigPath,tmpl);
}