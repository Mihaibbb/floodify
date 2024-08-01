let digits, digit_num, submit_btn, canvas, ctx, initial_point, block1, block2, theta, global_time, frames_after_finished, speed, drawing_scale;
let running_animation = false;
const width = 1200, height = 600;

class Block {
    constructor(x, w, c, m) {
        this.x = x;
        this.w = w;
        this.m = m;
        this.colour = c;
    }
    
    update_x(x) {
        this.x = x;
    }
    
    draw() {
        let x_ds = this.x * drawing_scale;
        let width_ds = this.w * drawing_scale;
        
        ctx.fillStyle = this.colour;
        ctx.fillRect(x_ds, (height - width_ds) / 2, width_ds, width_ds);
        
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center'; 
        ctx.font = '20px Arial';
        ctx.fillText(this.m + ' kg', x_ds + width_ds / 2, (height / 2) + 5);
    }
}

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    rotate(angle) {
        let sin_angle = Math.sin(angle), cos_angle = Math.cos(angle);
        
        return new Point(
            this.x * cos_angle - this.y * sin_angle,
            this.x * sin_angle + this.y * cos_angle
        )
    }
    
    reflect(angle) {
        let sin_two_angle = Math.sin(2 * angle);
        let cos_two_angle = Math.cos(2 * angle);
        
        return new Point(
            this.x * cos_two_angle + this.y * sin_two_angle,
            this.x * sin_two_angle - this.y * cos_two_angle
        )
    }
    
    angle() {
        if (this.x >= 0)
            return Math.atan(this.y / this.x);
        else
            return Math.PI - Math.atan(-this.y / this.x);
    }
}

function init_state(x1, x2, w1, w2, m1, m2) {
    let root_m1 = Math.sqrt(m1), root_m2 = Math.sqrt(m2);
    
    speed = Math.sqrt(m2) * 2;
    
    block1 = new Block(x1, w1, '#55ff55', m1);
    block2 = new Block(x2, w2, '#5555ff', m2);
    
    initial_point = new Point(x2 * root_m2, x1 * root_m1);
    theta = Math.atan(root_m1 / root_m2);
}

function init_drawing_scale() {
    let time_inf = time_of_last_collision() + frames_after_finished;
    let state_inf = current_state(time_inf);
    
    let side_of_block = state_inf.x + block1.w + block2.w;
    
    drawing_scale = 1;
    if (side_of_block > width)
        drawing_scale = width / side_of_block;
}

function calculation_point(t) {
    return new Point(initial_point.x - speed * t, initial_point.y);
}

function current_point(t) {
    let point = calculation_point(t);
    
    let phi = point.angle();
    let reflection_count = Math.floor(phi / theta);
    let rotation_angle = -theta * reflection_count;
    
    point = point.rotate(rotation_angle);
    if (reflection_count % 2 == 1)
        point = point.reflect(theta / 2);
    
    return point;
}

function going_to_collide(t) {
    let point = calculation_point(t);
    let phi = point.angle();
    
    let reflection_count = Math.ceil(phi / theta);
    let rotation_angle = theta * reflection_count;
    
    return (rotation_angle <= Math.PI);
}

function collision_count(t) {
    let point = calculation_point(t);
    let phi = point.angle();
    
    return Math.floor(phi / theta);
}

function time_of_last_collision() {
    let trig = Math.tan(theta * Math.floor(Math.PI / theta));
    return (initial_point.x - initial_point.y / trig) / speed;
}

function current_state(t) {
    let point = current_point(t);
    
    point.x /= Math.sqrt(block2.m);
    point.y /= Math.sqrt(block1.m);
    
    return point;
}

function update_blocks(t) {
    let state = current_state(t);
    
    block1.x = state.y;
    block2.x = state.x + block1.w;
}

function draw_text(t) {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; 
    ctx.font = '100px Arial';
    ctx.fillText(collision_count(t), width / 2, 150);
}

function run_animation(d) {
    digits = d;
    
    global_time = 0;
    
    let mass_2 = Math.pow(100, digits);
    let width_2 = 50 * (3 - 2 * Math.exp(-0.35 * digits));
    init_state(400, 800, 50, width_2, 1, mass_2);
    init_drawing_scale();
    
    frames_after_finished = 100;
    
    if (running_animation == false) {
        running_animation = true;
        requestAnimationFrame(draw);    
    }    
}

function handle_submit() {
    run_animation(Math.floor(digit_num.value));
}

function setup() {
    // Setting up canvas
    canvas = document.getElementById('canvas');
    canvas.width = width;
    canvas.height = height;
    
    // Getting drawing context
    ctx = canvas.getContext('2d');
    
    // Getting user inputs
    

    const digitSlider = document.getElementById('digit_slider');
    const digitValue = document.getElementById('digit_value');
    const submitBtn = document.getElementById('submit_btn');

    // Update the span with the current value of the slider
    digitSlider.addEventListener('input', function() {
        digit_num = digitSlider;

        digitValue.textContent = digitSlider.value;
    });

    // Function to start the animation (placeholder function)
    submitBtn.addEventListener('click', handle_submit);
    
    run_animation(3);
}

function draw() {
    // Clearing canvas
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, width, height);
    
    // Updating block positions
    update_blocks(global_time);
    
    // Drawing everything onto the canvas
    block1.draw();
    block2.draw();
    
    draw_text(global_time); 
    
    // Increasing the time step
    global_time += 1;
    
    // Continuing draw loop
    if (!going_to_collide(global_time))
        frames_after_finished -= 1;
    if (frames_after_finished > 0)
        requestAnimationFrame(draw);
    else
        running_animation = false;
}

window.onload = setup;

document.addEventListener('DOMContentLoaded', function() {
   

  
});