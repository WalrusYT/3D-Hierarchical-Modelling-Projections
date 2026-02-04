#version 300 es

precision mediump float;

uniform vec4 u_color;
out vec4 color;

void main() {
    color = u_color;
}