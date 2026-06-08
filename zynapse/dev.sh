#!/bin/sh

watchexec \
  --restart \
  --stop-signal SIGTERM \
  --stop-timeout 10s \
  --watch src \
  --watch build.zig \
  --watch build.zig.zon \
  --exts zig,zon,html,css \
  --ignore src/embedded_templates.zig \
  --ignore zig-cache \
  --ignore .zig-cache \
  --ignore zig-out \
  -- zig build run
