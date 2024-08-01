document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("gravitySlider").oninput = function() {
        gravity = this.value;
        document.getElementById("gravityValue").innerText = this.value;
    };

    document.getElementById("particleSizeSlider").oninput = function() {
        particleRadius = parseFloat(this.value);	
        document.getElementById("particleSizeValue").innerText = this.value;
        particleDiameter = 2 * particleRadius;
        restDensity = 1.0 / (particleDiameter * particleDiameter);
        kernelRadius = 3.0 * particleRadius;
        h2 = kernelRadius * kernelRadius;
        kernelScale = 4.0 / (Math.PI * h2 * h2 * h2 * h2);
        gridSpacing = kernelRadius * 1.5;
        invGridSpacing = 1.0 / gridSpacing;
        maxVel = 0.4 * particleRadius;
    };
});

let canvas = document.getElementById("myCanvas");
let c = canvas.getContext("2d");

let drawOrig = { x : canvas.width / 2, y : canvas.height - 20};
let drawScale = 200;

// global params

let gravity = -10;
let particleRadius = 0.013;
let unilateral = true;
let viscosity = 0.0;

let timeStep = 0.01;
let numIters = 1;
let numSubSteps = 10;

let maxParticles = 1000000;

let numX = 10;
let numY = 1000;
let numParticles = numX * numY;
let initialNumX = numX;
let initialNumY = numY;

// boundary

let width = 1.0;
let height = 2.0;

let boundaries = [];
let finalWalls = [];

let fluidOrig = { left : - 0.3, bottom : 1.8 };

// derived params

let particleDiameter = 2 * particleRadius;
let restDensity = 1.0 / (particleDiameter * particleDiameter);
let kernelRadius = 3.0 * particleRadius;
let h2 = kernelRadius * kernelRadius;
let kernelScale = 4.0 / (Math.PI * h2 * h2 * h2 * h2);		
// 2d poly6 (SPH based shallow water simulation

let gridSpacing = kernelRadius * 1.5;
let invGridSpacing = 1.0 / gridSpacing;

let maxVel = 0.4 * particleRadius;

let particles = {
	pos : new Float32Array(2 * maxParticles),
	prev : new Float32Array(2 * maxParticles),
	vel : new Float32Array(2 * maxParticles)
}

let i, j;
let simulationRunning = true;

class Vector {
	constructor(size) { 
		this.vals = new Int32Array(size); 
		this.maxSize = size;
		this.size = 0;
	}
	clear() {
		this.size = 0;
	}
	pushBack(val) {
		if (this.size >= this.maxSize) {
			this.maxSize *= 2;
			let old = this.vals;
			this.vals = new Int32Array(this.maxSize);
			for (i = 0; i < old.length; i++)
				this.vals[i] = old[i];
		}
		this.vals[this.size++] = val;
	}
}

function setup(initNumX, initNumY, button) {
	if (initNumX * initNumY > maxParticles)
		return;
	numX = initNumX;
	numY = initNumY;
	numParticles = numX * numY;
	initialNumX = initNumX;
	initialNumY = initNumY;

	let nr = 0;
	for (j = 0; j < numY; j++) {
		for (i = 0; i < numX; i++) {
			particles.pos[nr] = fluidOrig.left + i * particleDiameter;
			particles.pos[nr] += 0.00001 * (j % 2);
			particles.pos[nr + 1] = fluidOrig.bottom + j * particleDiameter;
			particles.vel[nr] = 0.0;
			particles.vel[nr + 1] = 0.0;
			nr += 2;				
		}
	}
	
	for (i = 0; i < hashSize; i++) {
		hash.first[i] = -1;
		hash.marks[i] = 0;
	}	

	if (button) {
		document.querySelectorAll(".button").forEach(btn => btn.classList.remove("selected"));
		button.classList.add("selected");
	}

	resizeCanvas(); // Call resizeCanvas to update the canvas size and scale
}

function solveBoundaries() {
	let minX = canvas.width * 0.5 / drawScale;
	
	for (i = 0; i < numParticles; i++) {
		let px = particles.pos[2 * i];
		let py = particles.pos[2 * i + 1];
		
		if (py < 0.0) {		// ground
			particles.pos[2 * i + 1] = 0.0;
		}
		
		if (px < -minX) 
			particles.pos[2 * i] = -minX;
		if (px > minX) 
			particles.pos[2 * i] = minX;

		for (j = 0; j < boundaries.length; j++) {
			let b = boundaries[j];
			if (px < b.left || px > b.right || py < b.bottom || py > b.top)
				continue;
			
			let dx, dy;
			if (px < (b.left + b.right) * 0.5) 
				dx = b.left - px;
			else
				dx = b.right - px;
				
			if (py < (b.bottom + b.top) * 0.5)
				dy = b.bottom - py;
			else
				dy = b.top - py;
				
			if (Math.abs(dx) < Math.abs(dy))
				particles.pos[2 * i] += dx;
			else
				particles.pos[2 * i + 1] += dy;
		}		
	}
}

function checkFinalWalls() {
	for (i = 0; i < numParticles; i++) {
		let px = particles.pos[2 * i];
		let py = particles.pos[2 * i + 1];

		for (j = 0; j < finalWalls.length; j++) {
			let b = finalWalls[j];
			if (px > b.left && px < b.right && py > b.bottom && py < b.top) {
				return j + 1;
			}
		}
	}
	return -1;
}

// -----------------------------------------------------------------------------------

let hashSize = 370111;

let hash = {
	size : hashSize,

	first : new Int32Array(hashSize),
	marks : new Int32Array(hashSize),
	currentMark : 0,

	next : new Int32Array(maxParticles),
	
	orig : { left : -100.0, bottom : -1.0 }	
}

let firstNeighbor = new Int32Array(maxParticles + 1);
let neighbors = new Vector(10 * maxParticles);
			
function findNeighbors() 
{
	// hash particles
	
	hash.currentMark++;
	
	
	for (i = 0; i < numParticles; i++) {
		let px = particles.pos[2 * i];
		let py = particles.pos[2 * i + 1];
		
		let gx = Math.floor((px - hash.orig.left) * invGridSpacing);
		let gy = Math.floor((py - hash.orig.bottom) * invGridSpacing);
		
		let h = (Math.abs((gx * 92837111) ^ (gy * 689287499))) % hash.size;
					
		if (hash.marks[h] != hash.currentMark) {				
			hash.marks[h] = hash.currentMark;
			hash.first[h] = -1;
		}

		hash.next[i] = hash.first[h];
		hash.first[h] = i;
	}
	
	// collect neighbors
	
	neighbors.clear();

	let h2 = gridSpacing * gridSpacing;

	for (i = 0; i < numParticles; i++) {
		firstNeighbor[i] = neighbors.size;
		
		let px = particles.pos[2 * i];
		let py = particles.pos[2 * i + 1];
		
		let gx = Math.floor((px - hash.orig.left) * invGridSpacing);
		let gy = Math.floor((py - hash.orig.bottom) * invGridSpacing);
		
		let x, y;
		
		for (x = gx - 1; x <= gx + 1; x++) {
			for (y = gy - 1; y <= gy + 1; y++) {
					
				let h = (Math.abs((x * 92837111) ^ (y * 689287499))) % hash.size;
					
				if (hash.marks[h] != hash.currentMark) 
					continue;
			
				let id = hash.first[h];
				while (id >= 0) 
				{
					let dx = particles.pos[2 * id] - px;
					let dy = particles.pos[2 * id + 1] - py;
					
					if (dx * dx + dy * dy < h2) 
						neighbors.pushBack(id);

					id = hash.next[id];						
				}
			}
		}
	}
	firstNeighbor[numParticles] = neighbors.size;
}

// -----------------------------------------------------------------------------------

let grads = new Float32Array(1000);

let sand = false;
	
function solveFluid()
{
	let h = kernelRadius;
	let h2 = h * h;
	let avgRho = 0.0;

	for (i = 0; i < numParticles; i++) {
	
		let px = particles.pos[2 * i];
		let py = particles.pos[2 * i + 1];

		let first = firstNeighbor[i];
		let num = firstNeighbor[i + 1] - first;

		let rho = 0.0;
		let sumGrad2 = 0.0;

		let gradix = 0.0;
		let gradiy = 0.0;
		
		for (j = 0; j < num; j++) {
		
			let id = neighbors.vals[first + j];				
			let nx = particles.pos[2 * id] - px;				
			let ny = particles.pos[2 * id + 1] - py;
			let r = Math.sqrt(nx * nx + ny * ny);
			
			if (r > 0) {
				nx /= r;
				ny /= r;
			}
				
			if (sand) {
				if (r < 2 * particleRadius) {
					let d = 0.5 * (2 * particleRadius - r);
					particles.pos[2 * i] -= nx * d;
					particles.pos[2 * i + 1] -= ny * d;
					particles.pos[2 * id] += nx * d;
					particles.pos[2 * id + 1] += ny * d;
				}
				continue;				
			}
			
			if (r > h) {
				grads[2 * j] = 0.0;
				grads[2 * j + 1] = 0.0;
			}
			else {
				let r2 = r * r;
				let w = (h2 - r2);
				rho += kernelScale * w * w * w;
				let grad = (kernelScale * 3.0 * w * w * (-2.0 * r)) / restDensity;					
				grads[2 * j] = nx * grad;
				grads[2 * j + 1] = ny * grad;
				gradix -= nx * grad;
				gradiy -= ny * grad;
				sumGrad2 += grad * grad;					
			}
		}
		sumGrad2 += (gradix * gradix + gradiy * gradiy);

		avgRho += rho;

		let C = rho / restDensity - 1.0;
		if (unilateral && C < 0.0)
			continue;

		let lambda = -C / (sumGrad2 + 0.0001);

		for (j = 0; j < num; j++) {
		
			let id = neighbors.vals[first + j];
			if (id == i) {
				particles.pos[2 * id] += lambda * gradix;
				particles.pos[2 * id + 1] += lambda * gradiy;
			
			}
			else {
				particles.pos[2 * id] += lambda * grads[2 * j];
				particles.pos[2 * id + 1] += lambda * grads[2 * j + 1];
			}
		}
	}
}

// -----------------------------------------------------------------------------------
	
function applyViscosity(pnr, dt)
{
	let first = firstNeighbor[i];
	let num = firstNeighbor[i + 1] - first;

	if (num == 0)
		return;

	let avgVelX = 0.0;
	let avgVelY = 0.0;
		
	for (j = 0; j < num; j++) {
		let id = neighbors.vals[first + j];				
		avgVelX += particles.vel[2 * id];
		avgVelY += particles.vel[2 * id + 1];
	}
			
	avgVelX /= num;
	avgVelY /= num;
	
	let deltaX = avgVelX - particles.vel[2 * pnr];
	let deltaY = avgVelY - particles.vel[2 * pnr + 1];
	
	particles.vel[2 * pnr] += viscosity * deltaX;
	particles.vel[2 * pnr + 1] += viscosity * deltaY;
}

// -----------------------------------------------------------------------------------
	
function simulate()
{
	findNeighbors();
	
	let dt = timeStep / numSubSteps;
	let step;
	
	for (step = 0; step < numSubSteps; step ++) {
		
		// predict
		
		for (i = 0; i < numParticles; i++) {
			particles.vel[2 * i + 1] += gravity * dt;
			particles.prev[2 * i] = particles.pos[2 * i];
			particles.prev[2 * i + 1] = particles.pos[2 * i + 1];
			particles.pos[2 * i] += particles.vel[2 * i] * dt;
			particles.pos[2 * i + 1] += particles.vel[2 * i + 1] * dt;
		}

		// solve
		
		solveBoundaries();
		solveFluid();

		const wallHit = checkFinalWalls();
		if (wallHit !== -1) {
			document.getElementById("message").innerHTML = `Simulation stopped: hit final wall ${wallHit}`;
			simulationRunning = false;
			return;
		}
		
		// derive velocities
		
		for (i = 0; i < numParticles; i++) {
			let vx = particles.pos[2 * i] - particles.prev[2 * i];
			let vy = particles.pos[2 * i + 1] - particles.prev[2 * i + 1];
			
			// CFL
			
			let v = Math.sqrt(vx * vx + vy * vy);
			if (v > maxVel) {
				vx *= maxVel / v;
				vy *= maxVel / v;
				particles.pos[2 * i] = particles.prev[2 * i] + vx;
				particles.pos[2 * i + 1] = particles.prev[2 * i + 1] + vy;
			}				
			particles.vel[2 * i] = vx / dt;
			particles.vel[2 * i + 1] = vy / dt;
			
			applyViscosity(i, dt);
		}
	}
}

// -----------------------------------------------------------------------------------

function draw() {
    c.clearRect(0, 0, canvas.width, canvas.height);

    // particles
    
    let nr = 0;
    for (i = 0; i < numParticles; i++) {
        c.fillStyle = "#1a40e9";
        let px = drawOrig.x + particles.pos[nr] * drawScale;
        let py = drawOrig.y - particles.pos[nr + 1] * drawScale;
        
        nr += 2;

        c.beginPath();            
        c.arc(px, py, particleRadius * drawScale, 0, Math.PI*2, true); 
        c.closePath();
        c.fill();
    }
    
    // boundaries
    
    for (i = 0; i < boundaries.length; i++) {
        let b = boundaries[i];
        let left = drawOrig.x + b.left * drawScale;
        let width = (b.right - b.left) * drawScale;
        let top = drawOrig.y - b.top * drawScale;
        let height = (b.top - b.bottom) * drawScale; 
        
        c.beginPath();
        if (b.selected) {
            c.strokeStyle = "#000000";
			c.fillStyle = "#54b5e698";
        } else {
            c.strokeStyle = "#000000";
            c.fillStyle = "#1173a36d";
        }
        c.fillRect(left, top, width, height);
        c.stroke();        
    }

    // final walls
    
    for (i = 0; i < finalWalls.length; i++) {
        let b = finalWalls[i];
        let left = drawOrig.x + b.left * drawScale;
        let width = (b.right - b.left) * drawScale;
        let top = drawOrig.y - b.top * drawScale;
        let height = (b.top - b.bottom) * drawScale; 
        
        c.beginPath();
        if (b.selected) {
            c.strokeStyle = "#000000";
            c.fillStyle = "#FF000077";
        } else {
            c.strokeStyle = "#000000";
            c.fillStyle = "#FF000088";
        }
        c.fillRect(left, top, width, height);
        c.stroke();
        
        // Draw the number inside the final wall
        c.fillStyle = "#FFFFFF";
        c.font = "16px Poppins"; // Adjust font size and family as needed
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(b.number, left + width / 2, top + height / 2);
    }
    
    c.beginPath();
    c.moveTo(0, drawOrig.y); c.lineTo(canvas.width, drawOrig.y);
    c.stroke();
}
	
// -----------------------------------------------------------------------------------
	
let timeFrames = 0;
let timeSum = 0;

function step() 
{
	if (!simulationRunning) return;

	let startTime = performance.now();
	
	simulate();		
	
	let endTime = performance.now();

	timeSum += endTime - startTime; 
	timeFrames++;
	
	if (timeFrames > 10) {
		timeSum /= timeFrames;
		document.getElementById("ms").innerHTML = timeSum.toFixed(3);		
		timeFrames = 0;
		timeSum = 0;
	}		
	
	draw();
	window.requestAnimationFrame(step);
}

document.getElementById("viscositySlider").oninput = function() {
	viscosity = this.value / 15;	
    document.getElementById("viscosityValue").innerText = this.value;

}

let isMouseDown = false;
let mouseX = 0;
let mouseY = 0;
let intervalId = null;

let isCreatingWall = false;
let selectStartX = 0;
let selectStartY = 0;
let selectEndX = 0;
let selectEndY = 0;
let boundariesSelected = [];

let simulationStarted = false;

canvas.addEventListener("mousedown", function(event) {
	updateMousePosition(event);
	if (!simulationStarted || !simulationRunning || event.shiftKey) { // Hold Shift to create walls before simulation starts
		isCreatingWall = true;
		selectStartX = mouseX;
		selectStartY = mouseY;
	} else if (simulationStarted && simulationRunning) {
		isMouseDown = true;
		startAddingParticles();
	}
});

canvas.addEventListener("mouseup", function(event) {
	if (isCreatingWall) {
		isCreatingWall = false;
		selectEndX = mouseX;
		selectEndY = mouseY;
		createWall(selectStartX, selectStartY, selectEndX, selectEndY);
		boundariesSelected = [];
	} else if (simulationStarted && simulationRunning) {
		isMouseDown = false;
		stopAddingParticles();
	}
});

canvas.addEventListener("mousemove", function(event) {
	updateMousePosition(event);
	if (isCreatingWall) {
		selectEndX = mouseX;
		selectEndY = mouseY;
		draw();
		drawSelection(selectStartX, selectStartY, selectEndX, selectEndY);
	} else if (isMouseDown && simulationStarted && simulationRunning) {
		updateMousePosition(event);
	}
});

canvas.addEventListener("click", function(event) {
	const currX = (event.clientX - canvas.getBoundingClientRect().left - drawOrig.x) / drawScale;
	const currY = (drawOrig.y - (event.clientY - canvas.getBoundingClientRect().top)) / drawScale;
    
	boundariesSelected = boundaries.filter((currBoundary) => {
		return isInsideBoundary(currX, currY, currBoundary);
	});

	boundariesSelected = boundariesSelected.concat(finalWalls.filter((currBoundary) => {
		return isInsideBoundary(currX, currY, currBoundary);
	}));

	boundaries.forEach((boundary) => {
		boundary.selected = boundariesSelected.includes(boundary);
	});

	finalWalls.forEach((boundary) => {
		boundary.selected = boundariesSelected.includes(boundary);
	});

	draw();
});

document.addEventListener("keydown", function(event) {
	if (boundariesSelected.length > 0 && (event.key === 'Delete' || event.key === 'Backspace')) {
		boundaries = boundaries.filter(currBoundary => !currBoundary.selected);
		finalWalls = finalWalls.filter(currBoundary => !currBoundary.selected);
		boundariesSelected = [];
		draw();
	}
});

function isInsideBoundary(x, y, boundary) {
	return x >= boundary.left && x <= boundary.right && y >= boundary.bottom && y <= boundary.top;
}

function updateMousePosition(event) {
	let rect = canvas.getBoundingClientRect();
	mouseX = (event.clientX - rect.left - drawOrig.x) / drawScale;
	mouseY = (drawOrig.y - (event.clientY - rect.top)) / drawScale;
}

function startAddingParticles() {
	if (intervalId === null) {
		intervalId = setInterval(function() {
			addParticle(mouseX, mouseY);
		}, 50); // Adjust the interval time as needed
	}
}

function stopAddingParticles() {
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
}

function addParticle(x, y) {
	if (numParticles >= maxParticles) return;
	let nr = 2 * numParticles;
	particles.pos[nr] = x;
	particles.pos[nr + 1] = y;
	particles.vel[nr] = 0.0;
	particles.vel[nr + 1] = 0.0;
	numParticles++;
}

function createWall(x1, y1, x2, y2) {
    if (Math.abs(x1 - x2) <= 0.01 || Math.abs(y1 - y2) <= 0.01) return; 
    const wallType = document.getElementById("wallType").value;
    const wall = {
        left: Math.min(x1, x2),
        right: Math.max(x1, x2),
        bottom: Math.min(y1, y2),
        top: Math.max(y1, y2),
        selected: false,
        number: null // Add a number property
    };

    if (wallType === "final") {
        wall.number = finalWalls.length + 1; // Assign a number
        finalWalls.push(wall);
    } else {
        boundaries.push(wall);
    }
    
    boundariesSelected = [];
    draw();
}

function drawSelection(x1, y1, x2, y2) {
	c.strokeStyle = '#000';
	c.fillStyle = "#1172a322";
	c.lineWidth = 1;
	let left = drawOrig.x + Math.min(x1, x2) * drawScale;
	let top = drawOrig.y - Math.max(y1, y2) * drawScale;
	let width = Math.abs(x2 - x1) * drawScale;
	let height = Math.abs(y2 - y1) * drawScale;
	c.fillRect(left, top, width, height);
}

function resizeCanvas() {
	canvas.width = window.innerWidth * 0.8;
	canvas.height = window.innerHeight * 0.8;
	drawOrig.x = canvas.width / 2;
	drawOrig.y = canvas.height - 20;
	drawScale = Math.min(canvas.width / width, canvas.height / height);
	draw();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial resize to set up the canvas

function startSimulation() {
	simulationStarted = true;
	simulationRunning = true;
	document.getElementById("message").innerHTML = "";
	setup(initialNumX, initialNumY, document.querySelector(".button.selected")); // Reset initial water particles
	step();
}

// main

setup(10, 200);
