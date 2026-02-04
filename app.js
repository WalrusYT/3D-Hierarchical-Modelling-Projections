import { buildProgramFromSources, loadShadersFromURLS, setupWebGL, loadJSONFile } from "./libs/utils.js";
import { ortho, perspective, lookAt, flatten, mult, mat4, rotateX, translate, rotateY, rotateZ, scalem, normalize, vec4, vec3 } from "./libs/MV.js";
import { modelView, loadMatrix, multMatrix, multRotationX, multRotationY, multRotationZ, multScale, multTranslation, popMatrix, pushMatrix } from "./libs/stack.js";

import * as CUBE from './libs/objects/cube.js';
import * as CYLINDER from './libs/objects/cylinder.js';
import * as SPHERE from './libs/objects/sphere.js';

// cannon limits
const CANNON_ROTATION_UPPER_LIMIT = 80;
const CANNON_ROTATION_LOWER_LIMIT = -17;

// tomato parameters
const TOMATO_SPEED = 5.0;      
const TOMATO_GRAVITY = -5.0;     
const TOMATO_COLOR = [1, 0.1, 0.1, 1]; 

// hole parameters
const HOLE_RADIUS_ORIG = 0.8;     // original size (was HOLE_RADIUS)
const HOLE_HEIGHT = 0.25;
const HOLE_COLOR = [0, 0, 0, 1];

// size logic
const TOMATO_RADIUS = 0.08;       // matches tomato scale
const HOLE_RADIUS_MIN = TOMATO_RADIUS;
const HOLE_RADIUS_STEP = 0.06;    // how much the hole changes per hit

// perspective parameters
const BASE_FOVY = 60;
const NEAR_PLANE = 0.01;  //fixed for 4th view
const FAR_PLANE = 200;

// zoom properties
const ZOOM_MAX = 166;
const ZOOM_STEP = 1.1;

// tank properties
const CANNON_STEP = 5;
const CABIN_STEP = 5;
const TANK_SPEED = 0.1;

// parameters for projections
const AXONO_DEFAULT = { theta: 35, gamma: 45 };
const OBLIQUE_DEFAULT = { alpha: 45, lambda: 0.5 };
const AXONO_STEP = 5;
const OBLIQUE_STEP = 5;

// default view matrices
// front view
const FRONT_EYE = [0, 0.6, 3];
const FRONT_AT = [0, 0.6, 0];
const FRONT_UP = [0, 1, 0];

// left view
const LEFT_EYE = [-3, 0.6, 0];
const LEFT_AT = [0, 0.6, 0];
const LEFT_UP = [0, 1, 0];

// top view
const TOP_EYE = [0, 5, 0];
const TOP_AT = [0, 0.6, 0];
const TOP_UP = [0, 0, -1];

const FOURTH_EYE = [0, 0.6, 7]; //added for 4th view

// ground parameters
const TILE_SIZE = 0.5;
const TILE_HEIGHT = 0.05;
const TILES_PER_SIDE = 24;
const COLOR_A = [0.8, 0.8, 0.8, 1];
const COLOR_B = [1, 1, 1, 1];

// time step
const DT = 0.005;

// scoring
let score = 0;
let bestScore = Number(localStorage.getItem("bestScore") || 0); // load best score from localStorage
let streak = 0; // consecutive hits
const BASE_POINTS = 10;   // points when hole is at original size
const STREAK_BONUS = 0.25; // +25% per consecutive hit

let wireframe = false;


function setup(shaders) {
    let canvas = document.getElementById("gl-canvas");
    let aspect = canvas.width / canvas.height;

    // view and projection parameters
    let zoom = 1;
    let mView = lookAt(FRONT_EYE, FRONT_AT, FRONT_UP);
    let u_color;
    let currentView = 0;
    let projectionType = 0;

    // hole state
    let hole = {
        pos: null,                 // [x, y, z]
        radius: HOLE_RADIUS_ORIG,  // current radius
        shrinking: true            // direction: shrink until min, then grow back
    };

    // view mode
    let multiView = false;
    let isPerspective = false;
    const viewTypes = [
        {type: 'axonometric', theta: AXONO_DEFAULT.theta, gamma: AXONO_DEFAULT.gamma},
        {type: 'oblique', alpha: OBLIQUE_DEFAULT.alpha, l: OBLIQUE_DEFAULT.lambda}
    ];
    

    // scene graph nodes by name
    const nodesByName = {};
    let sceneGraph = null;
    // active tomatoes
    let tomatoes = [];

    /** @type WebGL2RenderingContext */
    let gl = setupWebGL(canvas);

    let program = buildProgramFromSources(gl, shaders["shader.vert"], shaders["shader.frag"]);
    u_color = gl.getUniformLocation(program, "u_color");

    CUBE.init(gl);
    CYLINDER.init(gl);
    SPHERE.init(gl);

    resize_canvas();
    window.addEventListener("resize", resize_canvas);

    document.onkeydown = function (event) {
        switch (event.key) {
            case '1':
                // front view
                if (isPerspective) isPerspective = false;
                currentView = 0;
                mView = lookAt(FRONT_EYE, FRONT_AT, FRONT_UP);
                break;
            case '2':
                // left side view
                if (isPerspective) isPerspective = false;
                currentView = 1;
                mView = lookAt(LEFT_EYE, LEFT_AT, LEFT_UP);
                break;
            case '3':
                // top view
                if (isPerspective) isPerspective = false;
                currentView = 2;
                mView = lookAt(TOP_EYE, TOP_AT, TOP_UP);
                break;
            case '4':
                // fourth view
                if (isPerspective) isPerspective = false;
                currentView = 3;
                mView = lookAt(FOURTH_EYE, FRONT_AT, FRONT_UP);
                break;
            case '0':
                // toggle single <-> multiple views
                if (isPerspective) isPerspective = false;
                multiView = !multiView;
                break;
            case '8':
                // toggle axonometric <-> oblique (view 4)
                if (currentView == 3) {
                    if (!isPerspective) projectionType = (projectionType + 1) % viewTypes.length;
                }
                break;
            case 'ArrowLeft':
                // rotate view (view 4)
                if (currentView == 3) {
                    if (viewTypes[projectionType].type == "axonometric") {
                        viewTypes[projectionType].theta += AXONO_STEP;
                    } else {
                        viewTypes[projectionType].alpha += OBLIQUE_STEP;
                    }
                }
                break;
            case 'ArrowRight':
                // rotate view (view 4)
                if (currentView == 3) {
                    if (viewTypes[projectionType].type == "axonometric") {
                        viewTypes[projectionType].theta -= AXONO_STEP;
                    } else {
                        viewTypes[projectionType].alpha -= OBLIQUE_STEP;
                    }
                }
                break;
            case 'ArrowUp':
                // increase parameter (view 4)
                if (currentView == 3) {
                    if (viewTypes[projectionType].type == "axonometric") {
                        viewTypes[projectionType].gamma += AXONO_STEP;
                    }
                    else {
                        viewTypes[projectionType].l = 
                        Math.min(viewTypes[projectionType].l + 0.1, 1.0);
                    }
                }
                break;
            case 'ArrowDown':
                // decrease parameter (view 4)
                if (currentView == 3) {
                    if (viewTypes[projectionType].type == "axonometric") {
                        viewTypes[projectionType].gamma -= AXONO_STEP;
                    }
                    else {
                        viewTypes[projectionType].l = 
                        Math.max(viewTypes[projectionType].l - 0.1, 0.1);
                    }
                }
                break;
            case 'a':
                // rotate cabin left
                if (nodesByName["cabin"]) {
                    nodesByName["cabin"].rotation[1] += CABIN_STEP;
                }
                break;
            case 'd':
                // rotate cabin right
                if (nodesByName["cabin"]) {
                    nodesByName["cabin"].rotation[1] -= CABIN_STEP;
                }
                break;
            case 'w':
                // rotate cannon up
                if (nodesByName["cannon_base"]) {
                    nodesByName["cannon_base"].rotation[2] = 
                    Math.min(nodesByName["cannon_base"].rotation[2] + CANNON_STEP, CANNON_ROTATION_UPPER_LIMIT);
                }
                break;
            case 's':
                // rotate cannon down
                if (nodesByName["cannon_base"]) {
                    nodesByName["cannon_base"].rotation[2] = 
                    Math.max(nodesByName["cannon_base"].rotation[2] - CANNON_STEP, CANNON_ROTATION_LOWER_LIMIT);
                }
                break;
            case 'q':
                // move tank left
                if (nodesByName["tank"]) {
                    nodesByName["tank"].translation[0] += TANK_SPEED;
                    updateWheelRotation(20);
                }
                break;
            case 'e':
                // move tank right
                if (nodesByName["tank"]) {
                    nodesByName["tank"].translation[0] -= TANK_SPEED;
                    updateWheelRotation(-20);
                }
                break;
            case ' ':
                // toggle wireframe
                wireframe = !wireframe;
                break;
            case '9':
                // toggle perspective/orthographic (view 4)
                if (viewTypes[projectionType].type != "oblique") isPerspective = !isPerspective;
                break;
            case 'r':
                // reset view parameters
                if (viewTypes[projectionType].type == "axonometric") {
                    viewTypes[projectionType].theta = AXONO_DEFAULT.theta;
                    viewTypes[projectionType].gamma = AXONO_DEFAULT.gamma;
                } else {
                    viewTypes[projectionType].alpha = OBLIQUE_DEFAULT.alpha;
                    viewTypes[projectionType].l = OBLIQUE_DEFAULT.lambda;
                }
                break;
            case 'z':
                // fire the tomato
                fireTomato();
                break;
            case 'x': 
                //reset score
                resetScore();
                break;
            case 'b': 
                //reset best score
                bestScore = 0;
                localStorage.setItem("bestScore", "0");
                updateScoreHUD();
                break;

        }

        
    }
    canvas.onwheel = function(event) {
        if (event.deltaY <= 0) {
            zoom /= ZOOM_STEP;
        }
        else {
            zoom *= ZOOM_STEP;
        }
    }

    gl.clearColor(0.3, 0.3, 0.3, 1.0);
    gl.enable(gl.CULL_FACE); // cull back faces (typical) (better performance, 
    // as was mentioned on lecture)
    gl.cullFace(gl.BACK);
    gl.enable(gl.DEPTH_TEST);   // Enables Z-buffer depth test

    // load scene graph
    loadJSONFile("scene.json").then(obj => {
        sceneGraph = obj;
        indexNodes(sceneGraph);
        window.requestAnimationFrame(render);
    });

    // index nodes by name for easy access
    function indexNodes(node) {
        if (!node || !node.name) return;
        nodesByName[node.name] = node;
        if (node.children) {
            for (let child of node.children) {
                indexNodes(child, node);
            }
        }
    }

    // handle canvas resizing
    function resize_canvas(event) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        aspect = canvas.width / canvas.height;
        gl.viewport(0, 0, canvas.width, canvas.height);
        let proj = ortho(-aspect * zoom, aspect * zoom, -zoom, zoom, -50, 50); //fixed for 4th view
        uploadProjection(proj);
    }

    // update wheel rotation when tank moves
    function updateWheelRotation(rotationSpeed) {
        for (let wheel of nodesByName["wheelsRootLeft"].children) {
            wheel.rotation[1] = (wheel.rotation[1] + rotationSpeed) % 360;
        }
        for (let wheel of nodesByName["wheelsRootRight"].children) {
            wheel.rotation[1] = (wheel.rotation[1] + rotationSpeed) % 360;
        }
    }

    // upload projection matrix
    function uploadProjection(m) {
        uploadMatrix("u_projection", m);
    }

    // upload model-view matrix
    function uploadModelView() {
        uploadMatrix("u_model_view", modelView());
    }

    // upload a 4x4 matrix uniform
    function uploadMatrix(name, m) {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, name), false, flatten(m));
    }

    // oblique projection matrix
    function obliqueProjection(alpha, l) {
        const m = mat4(
            1, 0, -l * Math.cos(alpha * Math.PI / 180), 0,
            0, 1, -l * Math.sin(alpha * Math.PI / 180), 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
        return m;
    }

    // get world matrix of a given node
    function getWorldMatrix(node) {
        const chain = [node];
        while (node.parent) {
            node = nodesByName[node.parent];
            chain.push(node);
        }   
        let m = mat4();
        chain.reverse();
        for (let n of chain) {
            m = mult(m, translate(n.translation));
            m = mult(m, rotateZ(n.rotation[2]));
            m = mult(m, rotateY(n.rotation[1]));
            m = mult(m, rotateX(n.rotation[0]));
        }
        return m;
    }


    // get cannon tip position and direction in world coordinates
    function getCannonPose() {
        const cannon = nodesByName["cannon"];
        if (!cannon) return null;
        const M = getWorldMatrix(cannon); // world matrix of cannon base
        const tip4 = mult(M, vec4(0, -0.5, 0, 1)); // cannon tip position (in homogenous coords)
        const dir4 = mult(M, vec4(0, -1, 0, 0));  // cannon direction vector (in homogenous coords)
        const tip = vec3(tip4[0], tip4[1], tip4[2]); // convert to vec3
        const dir = normalize(vec3(dir4[0], dir4[1], dir4[2])); // convert to vec3 and normalize the direction
        return { tip, dir }; // so pose is a tuple of position and direction
    }

    // fire a tomato from the cannons
    function fireTomato() {
        const pose = getCannonPose(); if (!pose) return;
        const offset = 0.1, speed = TOMATO_SPEED;
        // add new tomato to active tomatoes list with initial position and velocity
        tomatoes.push({
            pos: [pose.tip[0] + pose.dir[0]*offset,
            pose.tip[1] + pose.dir[1]*offset,
            pose.tip[2] + pose.dir[2]*offset],
            vel: [pose.dir[0]*speed, pose.dir[1]*speed, pose.dir[2]*speed]
        });
    }

    // update tomato positions and handle scoring
    function updateTomatoes(dt) {
        const g = TOMATO_GRAVITY;
        for (let t of tomatoes) {
            t.vel[1] += g*dt;
            t.pos[0] += t.vel[0]*dt;
            t.pos[1] += t.vel[1]*dt;
            t.pos[2] += t.vel[2]*dt;
            // hole hit test
            if (hole.pos) {
                const dx = t.pos[0] - hole.pos[0]; // x distance to hole center
                const dz = t.pos[2] - hole.pos[2]; // z distance to hole center
                const r = hole.radius;
                const nearGround = Math.abs(t.pos[1]) < 0.05; // close to ground
                if (dx*dx + dz*dz <= r*r && nearGround) { // if inside hole radius and near ground
                    // tomato scored: remove tomato and adjust hole size
                    t._remove = true;
                    // successful hit: update score
                    const points = scoreForHit(hole.radius);
                    commitScore(points);
                    // adjust hole size for next time (depending on whether the hole is shrinking or growing)
                    if (hole.shrinking) {
                        hole.radius = Math.max(HOLE_RADIUS_MIN, hole.radius - HOLE_RADIUS_STEP);
                        if (hole.radius <= HOLE_RADIUS_MIN + 1e-6) {
                            hole.shrinking = false; // start growing on next hits
                        }
                    } else {
                        hole.radius = Math.min(HOLE_RADIUS_ORIG, hole.radius + HOLE_RADIUS_STEP);
                        if (hole.radius >= HOLE_RADIUS_ORIG - 1e-6) {
                            hole.shrinking = true; // reached full size, next hits shrink again
                        }
                    }
                    relocateHole();
                }
            }
            // out-of-bounds test
            if (!t._remove && t.pos[1] < -0.1 || Math.abs(t.pos[0]) > 5 || Math.abs(t.pos[2]) > 5) {
                t._missed = true;
                // missed tomato: reset streak
                streak = 0;
                updateScoreHUD();
            }
        }

        // remove out-of-bounds + scored tomatoes
        tomatoes = tomatoes.filter(t =>
            !t._remove &&
            !(t.pos[1] < -0.1 || Math.abs(t.pos[0]) > 5 || Math.abs(t.pos[2]) > 5)
        );
    }

    // draw all active tomatoes
    function drawTomatoes() {
        for (let t of tomatoes) {
            pushMatrix();
            multTranslation(t.pos);
            multScale([TOMATO_RADIUS, TOMATO_RADIUS, TOMATO_RADIUS]);
            gl.uniform4fv(u_color, TOMATO_COLOR);
            uploadModelView();
            if (!wireframe) {
                SPHERE.draw(gl, program, gl.TRIANGLES);
            } else {
                gl.uniform4fv(u_color, [0.0, 0.0, 0.0, 1.0]);
                SPHERE.draw(gl, program, gl.LINES);
            }
            popMatrix();
        }
    }

    // draw scene graph recursively
    function drawByGraph(node) {
        pushMatrix();
        multTranslation(node.translation);   
        multRotationZ(node.rotation[2]);     
        multRotationY(node.rotation[1]);     
        multRotationX(node.rotation[0]);     
        multScale(node.scale);               
        if (node.color) {
            gl.uniform4fv(u_color, node.color);
        }
        uploadModelView();
        if (node.primitive == "cube") {
            if (!wireframe) {
                CUBE.draw(gl, program, gl.TRIANGLES);
            }
            gl.uniform4fv(u_color, [0.0, 0.0, 0.0, 1.0]);
            CUBE.draw(gl, program, gl.LINES);

        } else if (node.primitive == "cylinder") {
            if (!wireframe) {
                CYLINDER.draw(gl, program, gl.TRIANGLES);
            }
            gl.uniform4fv(u_color, [0.0, 0.0, 0.0, 1.0]);
            CYLINDER.draw(gl, program, gl.LINES);
        } else if (node.primitive == "sphere") {
            if (!wireframe) {
                SPHERE.draw(gl, program, gl.TRIANGLES);
            }
            gl.uniform4fv(u_color, [0.0, 0.0, 0.0, 1.0]);
            SPHERE.draw(gl, program, gl.LINES);
        }
        if (node.children) {
            for (let child of node.children) {
                pushMatrix();
                // cancel the parent's scale if the child does not inherit it
                if (child.inheritScale == false && node.scale) {
                    multScale([
                        1 / node.scale[0],
                        1 / node.scale[1],
                        1 / node.scale[2]
                    ]);
                }
                // set child's color if it does not have one
                if (!child.color && node.color) {
                    gl.uniform4fv(u_color, node.color);
                }
                drawByGraph(child);
                popMatrix();
            }
        }
    popMatrix();
    }

    // scoring functions
    function scoreForHit(holeRadius) {
        // smaller hole -> more points
        const tightness = (HOLE_RADIUS_ORIG / Math.max(HOLE_RADIUS_MIN, holeRadius));
        const scaled = BASE_POINTS * (0.5 + 0.5 * tightness);
        const streakMult = 1 + STREAK_BONUS * streak;
        return Math.round(scaled * streakMult);
    }
    
    // commit score and update HUD
    function commitScore(points) {
        score += points;
        streak += 1;
        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem("bestScore", String(bestScore));
        }
        updateScoreHUD();
    }

    // reset score and streak
    function resetScore() {
        score = 0;
        streak = 0;
        updateScoreHUD();
    }

    // update score display in HUD
    function updateScoreHUD() {
        const sEl = document.getElementById("scoreValue");
        const bEl = document.getElementById("bestValue");
        const stEl = document.getElementById("streakValue");
        if (sEl) sEl.textContent = String(score);
        if (bEl) bEl.textContent = String(bestScore);
        if (stEl) stEl.textContent = String(streak);
    }
    // initialize HUD once
    updateScoreHUD();

    // draw ground tiles
    function drawGround() {
        const half = TILES_PER_SIDE / 2;
        for (let i = -half; i < half; i++) {
            for (let j = -half; j < half; j++) {
                pushMatrix();

                multTranslation([i*TILE_SIZE, -TILE_HEIGHT/2, j*TILE_SIZE]);
                multScale([TILE_SIZE, TILE_HEIGHT, TILE_SIZE]);
                
                let color;
                if ((i + j) % 2 == 0) {
                    color = COLOR_A;
                } else {
                    color = COLOR_B;
                }

                gl.uniform4fv(u_color, color);
                uploadModelView();
                CUBE.draw(gl, program, gl.TRIANGLES);
                popMatrix();
            }
        }
    }

    // generate a random position for the hole within bounds
    function randomHolePos() {
        const rx = (Math.random() * 2 - 1) * 5;
        const rz = (Math.random() * 2 - 1) * 5;
        return [rx, -0.06, rz]; // a bit above ground to avoid z-fighting
    }

    // relocate hole to a new random position
    function relocateHole() {
        hole.pos = randomHolePos();
    }

    // draw the hole
    function drawHole() {
        if (!hole.pos) {
            const rx = (Math.random() * 2 - 1) * 5;
            const rz = (Math.random() * 2 - 1) * 5;
            hole.pos = [rx, -0.06, rz];
            hole.radius = HOLE_RADIUS_ORIG;
            hole.shrinking = true;
        }
        pushMatrix();
        multTranslation(hole.pos);
        multScale([
            Math.max(0.001, hole.radius),
            HOLE_HEIGHT,
            Math.max(0.001, hole.radius)
        ]);
        gl.uniform4fv(u_color, HOLE_COLOR);
        uploadModelView();
        CYLINDER.draw(gl, program, gl.TRIANGLES);
        popMatrix();
    }

    // draw the scene for a given view matrix and viewport size
    function drawScene(viewMat, vpW, vpH) {
        const aspectV = vpW / vpH;
        let proj;
        if (isPerspective) {
            const fovy = Math.min(BASE_FOVY * zoom * 0.5, ZOOM_MAX);
            proj = perspective(fovy, aspectV, NEAR_PLANE, FAR_PLANE)
        } else {
            proj = ortho(-aspectV * zoom, aspectV * zoom, -zoom, zoom, NEAR_PLANE, FAR_PLANE);
        }
        loadMatrix(viewMat);
        if (currentView == 3 && !multiView) {
            const view = viewTypes[projectionType];
            if (view.type == 'axonometric') {
                multRotationX(view.gamma);
                multRotationY(view.theta);
            } else if (view.type == 'oblique') {
                proj = mult(proj, obliqueProjection(view.alpha, view.l));
            }
        }
        uploadProjection(proj);
        drawGround();
        drawByGraph(sceneGraph);
        drawTomatoes();
        drawHole();
    }

    // render the entire scene
    function render() {
        window.requestAnimationFrame(render);
        if (!sceneGraph) return;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        updateTomatoes(DT);

        if (multiView) {
            // 4 equal-sized viewports
            const halfW = canvas.width / 2;
            const halfH = canvas.height / 2;

            // front view (top-left)
            gl.viewport(0, halfH, halfW, halfH);
            drawScene(lookAt([0, 0.6, 3], [0, 0.6, 0], [0, 1, 0]), halfW, halfH);

            // top view (top-right)
            gl.viewport(halfW, halfH, halfW, halfH);
            drawScene(lookAt([0, 5, 0], [0, 0.6, 0], [0, 0, -1]), halfW, halfH);

            // left view (bottom-left)
            gl.viewport(0, 0, halfW, halfH);
            drawScene(lookAt([-3, 0.6, 0], [0, 0.6, 0], [0, 1, 0]), halfW, halfH);

            // fourth view (bottom-right)
            gl.viewport(halfW, 0, halfW, halfH);
            drawScene(lookAt([0, 0.6, 3], [0, 0.6, 0], [0, 1, 0]), halfW, halfH);
        } else {
            // single full view
            gl.viewport(0, 0, canvas.width, canvas.height);
            drawScene(mView, canvas.width, canvas.height);
        }
    }
}

const urls = ["shader.vert", "shader.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders))
