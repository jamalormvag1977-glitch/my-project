#!/bin/bash
cd /home/z/my-project
exec node .next/standalone/server.js -H 0.0.0.0 -p 3000
