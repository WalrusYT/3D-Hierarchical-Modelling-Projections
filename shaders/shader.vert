#version 300 es

uniform mat4 u_model_view;
uniform mat4 u_projection;

in vec4 a_position;

void main() {
    gl_Position = u_projection * u_model_view * a_position;
}