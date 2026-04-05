#!/usr/bin/env node

import { init } from "./init.js";

const args = process.argv.slice(2);
const command = args[0];

if (command === "init") {
  await init();
} else if (command === "uninstall") {
  console.log("TODO: uninstall hook");
} else {
  console.log(`
  ClaudeMon — Monitor your Claude Code sessions in real time

  Usage:
    npx claudemon init       Set up the hook + authenticate
    npx claudemon uninstall  Remove the hook

  https://claudemon.com
  `);
}
