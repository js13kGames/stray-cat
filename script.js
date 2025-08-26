

document.addEventListener('DOMContentLoaded', function () {
    // Canvas setup
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Game objects
    const cat = {
        x: canvas.width / 2 - 35, y: canvas.height - 120, width: 70, height: 70,
        speed: 0, maxWalkSpeed: 5, maxRunSpeed: 10, acceleration: 0.5, deceleration: 0.7,
        facing: 'right', state: 'standing', frame: 0, frameCounter: 0, frameDelay: 8,
        worldPosition: 0, eatingTimer: 0, hunger: 0, wetness: 0
    };

    const rainCloud = {
        x: -200, y: 60, width: 120, height: 60, speed: cat.maxWalkSpeed + 2,
        isRaining: false, rainDrops: []
    };

    const mouse = {
        active: false, x: 0, y: canvas.height - 67, width: 26, height: 16, speed: 6,
        direction: 1, worldX: 0, jumpingTimer: 0, jumpingRandomControl: 0
    };

    const world = { offset: 0 };
    const timeSystem = { gameTime: 0, dayLength: 1800, daysCount: 0 };
    const buildings = [];
    const sprites = { walking: [], running: [], stopping: [], standing: [], eating: [] };

    let mouseSpawnTimer = 0;
    const mouseSpawnInterval = 300;

    // Sprite paths
    const spritePaths = {
        walking: ['./sprites/walking1.png', './sprites/walking2.png', './sprites/walking3.png', './sprites/walking4.png', './sprites/walking5.png', './sprites/walking6.png'],
        running: ['./sprites/running1.png', './sprites/running2.png', './sprites/running3.png', './sprites/running4.png', './sprites/running5.png', './sprites/running6.png'],
        stopping: ['./sprites/walking4.png', './sprites/walking1.png', './sprites/stopping.png'],
        eating: ['./sprites/eating.png']
    };

    // Keyboard state
    const keys = {};

    // Event listeners
    ['keydown', 'keyup'].forEach(type => {
        window.addEventListener(type, e => {
            const pressed = type === 'keydown';
            const key = e.key.toLowerCase();
            if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) keys[key] = pressed;
            if (e.key === 'Shift') keys.shift = pressed;
        });
    });

    // Utility functions
    const hexToRgb = hex => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    };

    const rgbToHex = (r, g, b) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

    const interpolateColor = (color1, color2, factor) => {
        const c1 = hexToRgb(color1), c2 = hexToRgb(color2);
        return rgbToHex(
            Math.round(c1.r + (c2.r - c1.r) * factor),
            Math.round(c1.g + (c2.g - c1.g) * factor),
            Math.round(c1.b + (c2.b - c1.b) * factor)
        );
    };

    // Game functions
    const gameOver = () => {
        const gameOverContainer = document.querySelector('#game-over-container');
        gameOverContainer.style.display = 'flex';
        document.querySelector('#days').textContent = timeSystem.daysCount;
        document.querySelector('#restart-button').addEventListener('click', () => window.location.reload())
    };

    const updateTime = () => {
        timeSystem.gameTime++;
        if (timeSystem.gameTime % timeSystem.dayLength === 0) timeSystem.daysCount++;
    };

    const getTimeOfDay = () => (timeSystem.gameTime % timeSystem.dayLength) / timeSystem.dayLength;
    const isDayTime = () => getTimeOfDay() < 0.5;

    const getCelestialInfo = () => {
        const timeOfDay = getTimeOfDay();
        const isDay = isDayTime();

        const colors = isDay ?
            ['#87CEEB', '#B0E0E6', '#4A5568', '#2D3748'] :
            ['#112A71', '#000A31', '#0A1A50', '#000520'];

        const celestialXIncrement = 200 * timeOfDay - 100;
        let celestialX, dayFactor;

        if (isDay) {
            celestialX = canvas.width * (1 - (timeOfDay * 2)) - celestialXIncrement;
            dayFactor = timeOfDay <= 0.125 ? timeOfDay / 0.125 :
                timeOfDay <= 0.375 ? 1 : 1 - ((timeOfDay - 0.375) / 0.125);
        } else {
            const nightTime = (timeOfDay - 0.5) * 2;
            celestialX = canvas.width * (1 - nightTime) - celestialXIncrement;
            dayFactor = 0;
        }

        return {
            x: celestialX, y: 80, color: isDay ? '#FFD700' : '#FEFF79',
            skyTop: rainCloud.isRaining ? interpolateColor(colors[2], colors[0], dayFactor) : colors[0],
            skyBottom: rainCloud.isRaining ? interpolateColor(colors[3], colors[1], dayFactor) : colors[1]
        };
    };

    const preloadSprites = () => new Promise(resolve => {
    let loadedCount = 0;
    const totalSprites = Object.values(spritePaths).flat().length;

    const onImageLoad = () => {
        loadedCount++;
        if (loadedCount === totalSprites) {
            sprites.standing.push(sprites.stopping[sprites.stopping.length - 1]);
            resolve();
        }
    };

    Object.entries(spritePaths).forEach(([type, paths]) => {
        paths.forEach((path, index) => {
            const img = new Image();
            img.onload = onImageLoad;
            img.onerror = onImageLoad; // Just continue without placeholder
            img.src = path;
            sprites[type][index] = img;
        });
    });
    });

    const createBuilding = x => {
        const floors = Math.floor(Math.random() * 8) + 3;
        const width = (Math.floor(Math.random() * 4) + 4) * 20;
        const height = floors * 25 + 20;
        const windows = [];
        const windowsPerFloor = Math.floor((width - 20) / 20);

        for (let floor = 0; floor < floors; floor++) {
            for (let w = 0; w < windowsPerFloor; w++) {
                windows.push({
                    x: 15 + w * 20, y: 15 + floor * 25,
                    width: 8, height: 12, lit: Math.random() > 0.4
                });
            }
        }

        return { x, y: canvas.height - 50 - height, width, height, windows };
    };

    const initializeBuildings = () => {
        for (let x = -2000; x < 4000; x += Math.random() * 50 + 100) {
            buildings.push(createBuilding(x));
        }
        buildings.sort((a, b) => a.x - b.x);
    };

    const maintainBuildings = () => {
        const viewLeft = world.offset - canvas.width;
        const viewRight = world.offset + canvas.width * 2;

        while (buildings.length > 0 && buildings[0].x + buildings[0].width < viewLeft) {
            buildings.shift();
        }

        const lastBuilding = buildings[buildings.length - 1];
        if (lastBuilding && lastBuilding.x < viewRight) {
            buildings.push(createBuilding(lastBuilding.x + lastBuilding.width + Math.random() * 50 + 50));
        }

        const firstBuilding = buildings[0];
        if (firstBuilding && firstBuilding.x > viewLeft) {
            buildings.unshift(createBuilding(firstBuilding.x - Math.random() * 100 - 150));
        }
    };

    const updateStatusBars = () => {
        cat.hunger += 0.05;

        if (rainCloud.isRaining) {
            const catIsGettingWet = rainCloud.rainDrops.some(drop => {
                const dropScreenX = drop.x - world.offset;
                const catScreenX = cat.x + cat.width / 2;
                return Math.abs(dropScreenX - catScreenX) < 10 && Math.abs(drop.y - cat.y) < 10;
            });
            if (catIsGettingWet) cat.wetness += 0.4;
        } else {
            cat.wetness -= 0.05;
        }

        cat.hunger = Math.max(0, Math.min(100, cat.hunger));
        cat.wetness = Math.max(0, Math.min(100, cat.wetness));

        if (cat.hunger >= 100 || cat.wetness >= 100) gameOver();
    };

    const drawBar = (x, y, value, colors, label) => {
        const barWidth = 150, barHeight = 20;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.fillStyle = value > 70 ? colors[1] : colors[0];
        ctx.fillRect(x, y, (value / 100) * barWidth, barHeight);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barWidth, barHeight);

        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText(label, x, y - 5);
    };

    const drawStatusBars = () => {
        const barX = canvas.width - 170;
        drawBar(barX, 20, cat.hunger, ['#44FF44', '#FF4444'], 'Hunger');
        drawBar(barX, 60, cat.wetness, ['#44DDFF', '#4444FF'], 'Wetness');
    };

    const drawMouseIndicator = () => {
        if (!mouse.active) return;

        const mouseOffScreen = mouse.x < 0 || mouse.x > canvas.width;
        if (!mouseOffScreen) return;

        const pulse = Math.sin(timeSystem.gameTime * 0.1) * 0.3 + 0.7;

        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#FF4444';

        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 20px Arial';

        if (mouse.x < 0) {
            ctx.fillText('<< MOUSE', 30, canvas.height / 2 - 30);
        } else {
            ctx.fillText('MOUSE >>', canvas.width - 120, canvas.height / 2 - 30);
        }

        ctx.restore();
    };

    const checkCollision = (rect1, rect2) =>
        rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y;

    const spawnMouse = () => {
        mouse.active = true;
        mouse.x = cat.facing === 'right' ? canvas.width * 0.25 : canvas.width * 0.75;
        mouse.worldX = mouse.x + world.offset;
        mouse.direction = cat.facing === 'right' ? -1 : 1;
    };

    const updateMouse = () => {
        if (!mouse.active) {
            mouseSpawnTimer++;
            if (mouseSpawnTimer >= mouseSpawnInterval) {
                spawnMouse();
                mouseSpawnTimer = 0;
            }
            return;
        }

        mouse.worldX += mouse.speed * mouse.direction;
        mouse.x = mouse.worldX - world.offset;

        if (mouse.jumpingTimer > 25) {
            mouse.y -= 11 * Math.abs(Math.sin(mouse.jumpingTimer % 25 / 25));
            mouse.jumpingTimer--;
        } else if (mouse.jumpingTimer > 0) {
            mouse.y += 11 * Math.abs(Math.sin(mouse.jumpingTimer % 25 / 25));
            mouse.jumpingTimer--;
        }

        if (mouse.jumpingRandomControl) mouse.jumpingRandomControl--;

        if (checkCollision(cat, mouse)) {
            mouse.active = false;
            cat.state = 'eating';
            cat.speed = 0;
            cat.eatingTimer = 180;
        } else if (mouse.jumpingTimer === 0 && Math.abs(cat.x - mouse.x) < 220) {
            if (Math.random() > 0.6 && mouse.jumpingRandomControl === 0) {
                mouse.jumpingTimer = 50;
                mouse.direction = -mouse.direction;
            } else {
                mouse.jumpingRandomControl = 120;
            }
        }
    };

    const drawMouse = () => {
        if (!mouse.active) return;

        ctx.fillStyle = '#383838';
        ctx.beginPath();
        ctx.ellipse(mouse.x + mouse.width / 2, mouse.y + mouse.height / 2, mouse.width / 2, mouse.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#383838';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const tailX = mouse.direction === 1 ? mouse.x : mouse.x + mouse.width;
        const tailEndX = tailX + (mouse.direction === 1 ? -10 : 10);
        ctx.moveTo(tailX, mouse.y + mouse.height / 2);
        ctx.lineTo(tailEndX, mouse.y + mouse.height / 2 - 5);
        ctx.stroke();

        const eyeX = mouse.x + mouse.width * (mouse.direction === 1 ? 0.75 : 0.25);
        const eyeY = mouse.y + mouse.height * 0.35;

        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 1, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#383838';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY - 6, 2, 0, Math.PI * 2);
        ctx.fill();
    };

    const updateRainCloud = () => {
        const cloudScreenX = rainCloud.x - world.offset + rainCloud.width / 2;
        const catScreenX = cat.x + cat.width / 2;
        const distance = cloudScreenX - catScreenX;
        const horizontalDistance = Math.abs(distance);

        rainCloud.isRaining = horizontalDistance < 80;

        if (rainCloud.isRaining) {
            for (let i = 0; i < 3; i++) {
                rainCloud.rainDrops.push({
                    x: rainCloud.x + Math.random() * rainCloud.width - 20,
                    y: rainCloud.y + rainCloud.height - 40,
                    speed: 5 + Math.random() * 3,
                });
            }
        }

        rainCloud.rainDrops = rainCloud.rainDrops.filter(drop => {
            drop.y += drop.speed;
            return drop.y < canvas.height && drop.y < cat.y + cat.height - 10;
        });

        if (Math.abs(distance) > 2) {
            rainCloud.x -= Math.sign(distance) * (rainCloud.isRaining ? cat.maxWalkSpeed : rainCloud.speed);
        }
    };

    const updateCat = () => {
        if (cat.state === 'eating') {
            cat.eatingTimer--;
            if (cat.eatingTimer <= 0) {
                cat.state = 'standing';
                cat.hunger = Math.max(0, cat.hunger - 30);
            }
            return;
        }

        const movingLeft = keys.arrowleft || keys.a;
        const movingRight = keys.arrowright || keys.d;

        if (movingLeft && !movingRight) cat.facing = 'left';
        else if (movingRight && !movingLeft) cat.facing = 'right';

        if (movingLeft || movingRight) {
            const targetSpeed = keys.shift ? cat.maxRunSpeed : cat.maxWalkSpeed;
            const direction = movingRight ? 1 : -1;

            if (Math.abs(cat.speed) < targetSpeed) {
                cat.speed += cat.acceleration * direction;
            } else {
                cat.speed = targetSpeed * direction;
            }

            cat.state = keys.shift ? 'running' : 'walking';
        } else {
            if (cat.speed !== 0) {
                const decelAmount = Math.min(Math.abs(cat.speed), cat.deceleration);
                cat.speed += cat.speed > 0 ? -decelAmount : decelAmount;

                if (Math.abs(cat.speed) < 0.1) {
                    cat.speed = 0;
                    cat.state = 'standing';
                } else {
                    if (cat.state !== 'stopping') {
                        cat.state = 'stopping';
                        cat.frame = 0;
                    }
                }
            } else {
                cat.state = 'standing';
            }
        }

        cat.worldPosition += cat.speed;
        world.offset = cat.worldPosition;

        cat.frameCounter++;
        if (cat.frameCounter >= cat.frameDelay) {
            cat.frameCounter = 0;

            if (cat.state === 'walking') {
                cat.frame = (cat.frame + 1) % sprites.walking.length;
            } else if (cat.state === 'running') {
                cat.frame = (cat.frame + 1) % sprites.running.length;
            } else if (cat.state === 'stopping') {
                if (cat.frame < sprites.stopping.length - 1) cat.frame++;
            } else {
                cat.frame = sprites.eating.length - 1;
            }
        }
    };

    const drawCat = () => {
        const spriteMap = {
            walking: sprites.walking[cat.frame],
            running: sprites.running[cat.frame],
            stopping: sprites.stopping[cat.frame],
            standing: sprites.standing[0],
            eating: sprites.eating[0]
        };

        const sprite = spriteMap[cat.state];
        if (!sprite) return;

        ctx.save();
        if (cat.facing === 'right') {
            ctx.translate(cat.x + cat.width, cat.y);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, 0, 0, cat.width, cat.height);
        } else {
            ctx.drawImage(sprite, cat.x, cat.y, cat.width, cat.height);
        }
        ctx.restore();
    };

    const drawBuilding = building => {
        const screenX = building.x - world.offset;
        if (screenX + building.width < 0 || screenX > canvas.width) return;

        ctx.fillStyle = '#877F7D';
        ctx.fillRect(screenX, building.y, building.width, building.height);
        ctx.strokeStyle = '#1A252F';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX, building.y, building.width, building.height);

        building.windows.forEach(window => {
            ctx.fillStyle = window.lit ? '#FFF59D' : '#37474F';
            ctx.fillRect(screenX + window.x, building.y + window.y, window.width, window.height);
            ctx.strokeStyle = '#1A252F';
            ctx.lineWidth = 1;
            ctx.strokeRect(screenX + window.x, building.y + window.y, window.width, window.height);
        });
    };

    const drawRainCloud = () => {
        const screenX = rainCloud.x - world.offset;
        if (screenX < -200 || screenX > canvas.width + 100) return;

        ctx.fillStyle = rainCloud.isRaining ? 'rgba(100, 100, 100, 0.9)' : 'rgba(200, 200, 200, 0.8)';

        const cloudParts = [[0, 0, 30], [25, -15, 25], [50, 0, 30], [75, -10, 20], [90, 0, 25], [45, 20, 25]];
        ctx.beginPath();
        cloudParts.forEach(([x, y, r]) => ctx.arc(screenX + x, rainCloud.y + y, r, 0, Math.PI * 2));
        ctx.fill();

        if (rainCloud.isRaining && Math.random() < 0.1) {
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(screenX + 45, rainCloud.y + 40);
            ctx.lineTo(screenX + 50, rainCloud.y + 60);
            ctx.lineTo(screenX + 40, rainCloud.y + 70);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(0, 174, 230, 0.9)';
        ctx.globalAlpha =  0.6;
        rainCloud.rainDrops.forEach(drop => {
            ctx.fillRect(drop.x - world.offset, drop.y, 2, 10);
        });
        ctx.globalAlpha = 1.0;
    };

    const drawBackground = () => {
        const celestialInfo = getCelestialInfo();

        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, celestialInfo.skyTop);
        gradient.addColorStop(1, celestialInfo.skyBottom);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = celestialInfo.color;
        ctx.beginPath();
        ctx.arc(celestialInfo.x, celestialInfo.y, 50, 0, Math.PI * 2);
        ctx.fill();

        buildings.forEach(drawBuilding);

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
    };

    const drawDayCounter = () => {
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.fillText(`${timeSystem.daysCount} days`, 20, 30);
    };

    
    const update = () =>  {
        updateTime();
        updateCat();
        updateRainCloud();
        updateMouse();
        updateStatusBars();
        maintainBuildings();
    }

    const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        drawRainCloud();
        drawMouse();
        drawCat();
        drawStatusBars();
        drawDayCounter();
        drawMouseIndicator();
    }

    const gameLoop = () => {
       draw();
       requestAnimationFrame(gameLoop);
    };

    // Initialize and start
    preloadSprites().then(() => {
        initializeBuildings();
        drawBackground();
        drawCat();
        document.querySelector('#play-button').addEventListener('click', () => {
            document.querySelector('#instructions-container').style.display = 'none';
            setInterval(update, 17)
            gameLoop();
        })
    }).catch(error => console.error("Error loading images:", error));
});