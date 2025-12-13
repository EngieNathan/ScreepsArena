// @ts-nocheck
import { getObjectsByPrototype, getTicks, findPath, getTerrainAt, getDirection } from 'game/utils';
import { Flag, Creep, StructureSpawn, StructureWall, StructureRampart,  } from 'game/prototypes';
import { MOVE, CARRY, WORK, ATTACK, RANGED_ATTACK, HEAL, TOUGH, RESOURCE_ENERGY, ERR_NOT_IN_RANGE, BODYPART_COST, TERRAIN_WALL, TERRAIN_SWAMP } from 'game/constants';

// One spawn with limited energy, no sources, energy does not regenerate
// 15,000 Total Energy to spend, 50 Body Parts Max
// Only goal is to each the flag at the center first
// Secret passage exists but is blocked by 5 walls with 30,000 hits of health each
// Rampart wall you HAVE to dismantle has 10,000 hits of health

// Room is 100 x 100, approximately 100 ticks of travel time, travel time does not increase by using the secret passage but does allow intercept of enemies
// Creep lifetime is 1,500, each creep has to be spawned as well
// Time limit is 2,000 ticks

// Send out a basic scout to take the other non controlled flag
// 

// MOVE = 50
// WORK = 100
// ATTACK = 80 (30 Damage per Tick, 1,500 Damage per tick with 50 parts)
// RANGED_ATTACK = 150
// HEAL = 250
// TOUGH = 10

// 3 Creeps, 5K energy each
// 5 MOVE = 250
// 10 HEAL = 2,500
// 15 RANKED_ATTACK = 2.250

function isOnRampart(creep, ramparts) {
    for (let i = 0; i < ramparts.length; i++) {
        if (ramparts[i].x === creep.x && ramparts[i].y === creep.y) {
            return true;
        }
    }
    return false;
}
function isOnFlag(creep, flags) {
    for (let i = 0; i < flags.length; i++) {
        if (flags[i].x === creep.x && flags[i].y === creep.y) {
            return true;
        }
    }
    return false;
}
function isOnSwamp(creep) {
    if (creep.x >= 40 && creep.x <= 60 && creep.y >= 40 && creep.y <= 60) {
        const terrain = getTerrainAt({x: creep.x, y: creep.y});
        return terrain == TERRAIN_SWAMP;
    }
    
    return false;
    
}
function getMoveAwayPosition(creep, hostiles) {
    // Handle single hostile or array
    if (!Array.isArray(hostiles)) {
        hostiles = [hostiles];
    }
    
    // Calculate weighted escape vector from all hostiles
    let totalDx = 0;
    let totalDy = 0;
    let totalWeight = 0;
    
    for (let hostile of hostiles) {
        const dx = creep.x - hostile.x;
        const dy = creep.y - hostile.y;
        const distance = Math.max(1, Math.abs(dx) + Math.abs(dy)); // Manhattan distance
        
        // Weight closer enemies more heavily (inverse distance)
        const weight = 1 / distance;
        
        totalDx += (dx / distance) * weight;
        totalDy += (dy / distance) * weight;
        totalWeight += weight;
    }
    
    // Normalize the escape direction
    if (totalWeight > 0) {
        totalDx /= totalWeight;
        totalDy /= totalWeight;
    }
    
    // Convert to integer direction
    const dirX = Math.sign(totalDx) || 1;
    const dirY = Math.sign(totalDy) || 1;
    
    // Helper function to check if position is valid
    function isValidPosition(x, y) {
        // Check bounds
        if (x < 0 || x > 99 || y < 0 || y > 99) return false;
        
        // Check terrain
        const terrain = getTerrainAt({x, y});
        if (terrain === TERRAIN_WALL || terrain == TERRAIN_SWAMP) return false;
        
        // Check for enemy collision
        for (let hostile of hostiles) {
            if (hostile.x === x && hostile.y === y) return false;
        }
        
        return true;
    }
    
    // Try primary escape direction with varying distances
    for (let dist = 6; dist >= 1; dist--) {
        const newX = creep.x + Math.round(dirX * dist);
        const newY = creep.y + Math.round(dirY * dist);
        
        if (isValidPosition(newX, newY)) {
            return {x: newX, y: newY};
        }
    }
    
    // If primary direction blocked, try all 8 directions sorted by similarity to escape vector
    const directions = [
        {x: 1, y: 0},    // RIGHT
        {x: 1, y: -1},   // TOP_RIGHT
        {x: 0, y: -1},   // TOP
        {x: -1, y: -1},  // TOP_LEFT
        {x: -1, y: 0},   // LEFT
        {x: -1, y: 1},   // BOTTOM_LEFT
        {x: 0, y: 1},    // BOTTOM
        {x: 1, y: 1}     // BOTTOM_RIGHT
    ];
    
    // Sort directions by how well they align with escape vector
    directions.sort((a, b) => {
        const dotA = a.x * dirX + a.y * dirY;
        const dotB = b.x * dirX + b.y * dirY;
        return dotB - dotA; // Higher dot product = better alignment
    });
    
    // Try each direction with varying distances
    for (let dir of directions) {
        for (let dist = 6; dist >= 1; dist--) {
            const newX = creep.x + dir.x * dist;
            const newY = creep.y + dir.y * dist;
            
            if (isValidPosition(newX, newY)) {
                return {x: newX, y: newY};
            }
        }
    }
    
    // Last resort: try any adjacent square that's valid
    for (let dir of directions) {
        const newX = creep.x + dir.x;
        const newY = creep.y + dir.y;
        
        if (isValidPosition(newX, newY)) {
            return {x: newX, y: newY};
        }
    }
    
    return {x: creep.x, y: creep.y}; // No valid moves, stay put
}
function getThreatInRange(creep, hostiles, maxRange = 2) {  // Changed from 2 to 3
    for (let i = 0; i < hostiles.length; i++) {
        const hostile = hostiles[i];
        const range = creep.getRangeTo(hostile);
        if (range <= maxRange) {
            return hostile;
        }
    }
    return null;
}
function getClosestHostile (creep, hostiles) {
    var closestHostile = null;
    if (hostiles) {
        for (var e = 0; e < hostiles.length; e++) { // Hostile Creeps

            var hostile = hostiles[e];

            if (closestHostile == null) {
                closestHostile = hostile;
            } else {
                
                var oldRange = creep.getRangeTo(closestHostile);
                var newRange = creep.getRangeTo(hostile);
                
                if (newRange < oldRange) {
                    closestHostile = hostile;
                }
            }
        }
    }
    return closestHostile;
}
function getCircleSpawnPosition(creep, mySpawn, clockwise = true) {
    // Define the 8 positions around spawn in clockwise order
    const circlePositions = [
        {x: mySpawn.x, y: mySpawn.y - 2},     
        {x: mySpawn.x + 1, y: mySpawn.y - 2}, 
        {x: mySpawn.x + 2, y: mySpawn.y - 1}, 
        {x: mySpawn.x + 2, y: mySpawn.y},
        {x: mySpawn.x + 2, y: mySpawn.y + 1},
        {x: mySpawn.x + 1, y: mySpawn.y + 2},
        {x: mySpawn.x, y: mySpawn.y + 2},
        {x: mySpawn.x - 1, y: mySpawn.y + 2},
        {x: mySpawn.x - 2, y: mySpawn.y + 1},
        {x: mySpawn.x - 2, y: mySpawn.y},
        {x: mySpawn.x - 2, y: mySpawn.y - 1},
        {x: mySpawn.x - 1, y: mySpawn.y - 2}
    ];
    
    // Find current position index (or closest)
    let currentIndex = -1;
    let minDistance = 999;
    
    for (let i = 0; i < circlePositions.length; i++) {
        const pos = circlePositions[i];
        const distance = Math.abs(creep.x - pos.x) + Math.abs(creep.y - pos.y);
        
        if (distance < minDistance) {
            minDistance = distance;
            currentIndex = i;
        }
    }
    
    // Calculate next position
    const direction = clockwise ? 1 : -1;
    let nextIndex = (currentIndex + direction + 12) % 12;
    let attempts = 0;
    
    // Find next walkable position (skip walls)
    while (attempts < 12) {
        const nextPos = circlePositions[nextIndex];
        
        // Check bounds
        if (nextPos.x >= 0 && nextPos.x <= 99 && nextPos.y >= 0 && nextPos.y <= 99) {
            // Check if walkable
            const terrain = getTerrainAt({x: nextPos.x, y: nextPos.y});
            if (terrain !== TERRAIN_WALL) {
                return nextPos;
            }
        }
        
        // Try next position
        nextIndex = (nextIndex + direction + 12) % 12;
        attempts++;
    }
    
    // Fallback to current position
    return {x: creep.x, y: creep.y};
}
function getClosestHostileToSpawn (spawn, hostiles) {
    var closestHostile = null;
    for (var e = 0; e < hostiles.length; e++) {

        var hostile = hostiles[e];

        if (closestHostile == null) {
            closestHostile = hostile;
        } else {
            
            // @ts-ignore
            var oldPath = findPath({x:closestHostile.x, y:closestHostile.y}, {x:spawn.x, y:spawn.y});
            //var oldRange = closestHostile.getRangeTo(spawn);
            var newPath = findPath({x:hostile.x, y:hostile.y}, {x:spawn.x, y:spawn.y});
            //var newRange = hostile.getRangeTo(spawn);
            
            if (newPath.length < oldPath.length) {
                closestHostile = hostile;
            }
        }
        
    }
    return closestHostile;
}

function getHealAmount (parts, distance) {
    if (distance == 0 || distance == 1) {
        return parts * 12;
    } else if (distance == 2 || distance == 3) {
        return parts * 4;
    }
}
function getRangedAmount (parts, distance) {
    switch (distance) {
        case 1: return parts * 10;
        case 2: return parts * 4;
        case 3: return parts * 1;
    }
}
function getAttackAmount (parts) {
    return parts * 30;
}

function getHealingParts (body) {
    var healParts = 0;
    for (var part = 0; part < body.length; part++) {
        var currentPart = body[part];
        if (currentPart === HEAL) {
            healParts += 1;
        }
    }
    return healParts;
}
function getMoveParts (body) {
    var moveParts = 0;
    for (var part = 0; part < body.length; part++) {
        var currentPart = body[part];
        if (currentPart === MOVE) {
            moveParts += 1;
        }
    }
    return moveParts;
}
function getRangedParts (body) {
    var rangedParts = 0;
    for (var part = 0; part < body.length; part++) {
        var currentPart = body[part];
        if (currentPart === RANGED_ATTACK) {
            rangedParts += 1;
        }
    }
    return rangedParts;
}
function getAttackParts (body) {
    var attackParts = 0;
    for (var part = 0; part < body.length; part++) {
        var currentPart = body[part];
        if (currentPart === ATTACK) {
            attackParts += 1;
        }
    }
    return attackParts;
}



export function loop() {

    const flags = getObjectsByPrototype(Flag);
    const creeps = getObjectsByPrototype(Creep);
    const spawns = getObjectsByPrototype(StructureSpawn);
    const ramparts = getObjectsByPrototype(StructureRampart);
    const tick = getTicks();

    var tank; var healer; var dps; // Classic party formation

    var myCreeps = [];
    var hostileCreeps = [];

    for (var a = 0; a < spawns.length; a++) { // Get Spawns
        var currentSpawn = spawns[a];
        if (currentSpawn.my) {
            var mySpawn = currentSpawn;
        } else {
            var enemySpawn = currentSpawn;
        }
    }

    for (var b = 0; b < creeps.length; b++) { // Get Creeps
        var currentCreep = creeps[b];
        if (currentCreep.my && !currentCreep.spawning) {

            myCreeps.push(currentCreep);

            if (currentCreep.body.some(bodyPart => bodyPart.type == ATTACK)) {
                tank = currentCreep;
            }

            if (currentCreep.body.some(bodyPart => bodyPart.type == HEAL)) {
                healer = currentCreep;
            }

            if (currentCreep.body.some(bodyPart => bodyPart.type == RANGED_ATTACK)) {
                dps = currentCreep;
            }

            for (var c = 0; c < creeps.length; c++) {
                var enemyCreep = creeps[c];
                if (!enemyCreep.my && !isOnRampart(enemyCreep, ramparts) && !isOnFlag(enemyCreep, flags) && !isOnSwamp(enemyCreep)) {
                    hostileCreeps.push(enemyCreep);
                }
            }
        }
    }

    if (!mySpawn.spawning) {

        if (!healer) {
            mySpawn.spawnCreep([TOUGH, TOUGH,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                HEAL, HEAL, HEAL, HEAL, HEAL,
                                HEAL, HEAL, HEAL, HEAL, HEAL,
                                HEAL, HEAL, HEAL, HEAL, HEAL,
                                HEAL, HEAL, HEAL, HEAL, HEAL,
                                HEAL, HEAL, HEAL]).object;
        }

        if (!tank) {
            mySpawn.spawnCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK]).object;
        }

        if (!dps) {
            mySpawn.spawnCreep([MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                MOVE, MOVE, MOVE, MOVE, MOVE,
                                RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                                RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                                RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                                RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK]).object;
        }
        /*mySpawn.spawnCreep([RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
                            HEAL, HEAL, HEAL, HEAL, HEAL]).object;*/
    }
    
    var closestHostileToSpawn = getClosestHostileToSpawn(mySpawn, hostileCreeps); // Get the hostile closest to my spawn

    if (closestHostileToSpawn) {
        var distanceToSpawn = closestHostileToSpawn.getRangeTo(mySpawn); // Determine the range of the hostile to mySpawn
    }

    ///////////////////
    // Scenario Actions
    ///////////////////

    // DPS
    if (dps && !tank && !healer) {

        // ATTACK
        var dpsClosestHostile = getClosestHostile(dps, hostileCreeps);

        if (dps.getRangeTo(enemySpawn) <= 3) { // If enemy spawn is in range

            dps.rangedAttack(enemySpawn); // Attack it

        } else {

            if (dpsClosestHostile != null) { // If there is a closest hostile

                var range = dps.getRangeTo(dpsClosestHostile);

                if (range <= 3) { // If hostile is in range
                    dps.rangedAttack(dpsClosestHostile); // Ranged Attack
                }
            }
        }

        // MOVE
        if (tick >= 1500) { // Only one left

            var dpsThreat = getThreatInRange(dps, hostileCreeps); // DPS Threat

            if (dpsThreat) { // If threat is close to melee range

                var retreat = getMoveAwayPosition(dps, hostileCreeps); // Kite Postion
                dps.moveTo(retreat); // Kite
                
            } else { // No hostiles within range of 2

                var distanceToEnemySpawn = dps.getRangeTo(enemySpawn);

                if (closestHostileToSpawn) {
                    if (distanceToEnemySpawn < distanceToSpawn) {
                        dps.moveTo(enemySpawn);
                    } else {
                        dps.moveTo(closestHostileToSpawn)
                    }
                } else {
                    dps.moveTo(enemySpawn);
                }
            }
            
        } else { // Up until tick 1500
            
            var pos = getCircleSpawnPosition(dps, mySpawn); // Circle my spawn
            dps.moveTo(pos);

        }
    }

    // TANK & DPS
    if (dps && tank && !healer) {

        // ATTACK
        var dpsClosestHostile = getClosestHostile(dps, hostileCreeps);
        var tankClosestHostile = getClosestHostile(tank, hostileCreeps);

        // DPS
        if (dps.getRangeTo(enemySpawn) <= 3) {
            dps.rangedAttack(enemySpawn);
        } else {
            if (dpsClosestHostile != null) {
                var range = dps.getRangeTo(dpsClosestHostile);

                if (range <= 3) {
                    dps.rangedAttack(dpsClosestHostile);
                }
            }
        }

        // TANK
        if (tank.getRangeTo(enemySpawn) <= 1) {
            tank.attack(enemySpawn);
        } else {
            if (tankClosestHostile != null) {
                var range = tank.getRangeTo(tankClosestHostile);

                if (range <= 1) {
                    tank.attack(tankClosestHostile);
                }
            }
        }

        // MOVE

        // DPS
        var dpsThreat = getThreatInRange(dps, hostileCreeps); // DPS Threat

        if (dpsThreat) {
            var retreat = getMoveAwayPosition(dps, hostileCreeps);
            dps.moveTo(retreat);
        } else {
            dps.moveTo(tank);
        }

        // TANK
        if (tick >= 1500) { // Only one left

            var distanceToEnemySpawn = tank.getRangeTo(enemySpawn);

            if (closestHostileToSpawn) {
                if (distanceToEnemySpawn < distanceToSpawn) {
                    tank.moveTo(enemySpawn);
                } else {
                    tank.moveTo(closestHostileToSpawn)
                }
            } else {
                tank.moveTo(enemySpawn);
            }

        } else {
            
            var pos = getCircleSpawnPosition(tank, mySpawn);
            tank.moveTo(pos);
        }
    }

    // TANK, DPS, & HEALER
    // Protect HEALER at all costs from hostile damage
    if (dps && tank && healer) {

        var healerClosestHostile = getClosestHostile(healer, hostileCreeps);
        var dpsClosestHostile = getClosestHostile(dps, hostileCreeps);
        var tankClosestHostile = getClosestHostile(tank, hostileCreeps);

        if (healerClosestHostile != tankClosestHostile) {
            
        }
        
        
        // DPS ATTACK
        if (dps.getRangeTo(enemySpawn) <= 3) {
            dps.rangedAttack(enemySpawn);
        } else {
            if (dpsClosestHostile != null) {
                var range = dps.getRangeTo(dpsClosestHostile);

                if (range <= 3) {
                    dps.rangedAttack(dpsClosestHostile);
                }
            }
        }

        // TANK ATTACK
        if (tank.getRangeTo(enemySpawn) <= 1) {
            tank.attack(enemySpawn);
        } else {
            if (tankClosestHostile != null) {
                var range = tank.getRangeTo(tankClosestHostile);

                if (range <= 1) {
                    tank.attack(tankClosestHostile);
                }
            }
        }

        // DPS MOVE
        var dpsThreat = getThreatInRange(dps, hostileCreeps); // DPS Threat

        if (dpsThreat) { // If 
            var retreat = getMoveAwayPosition(dps, hostileCreeps);
            dps.moveTo(retreat);
        } else {

            if (tick >= 1000) {
                if (dps.getRangeTo(healer) == 1) {
                    dps.moveTo(enemySpawn);
                }
            } else {
                if (dps.getRangeTo(healer) == 1) {
                    dps.moveTo(tank);
                }
            }
        }

        

        // TANK MOVE
        /*if (tick >= 1500) {
            if (tank.getRangeTo(dps) == 1) {

                var distanceToEnemySpawn = findPath(tank, enemySpawn).length;

                if (closestHostileToSpawn) {
                    if (distanceToEnemySpawn < distanceToSpawn) {
                        tank.moveTo(enemySpawn);
                    } else {
                        tank.moveTo(closestHostileToSpawn)
                    }
                } else {
                    tank.moveTo(enemySpawn);
                }
                
            } else {
                tank.moveTo(dps);
            }
        } else {*/
            var pos = getCircleSpawnPosition(tank, mySpawn);
            tank.moveTo(pos);
        //}

        // HEALER
        if (dps.hits < dps.hitsMax) {

            var healerRange = healer.getRangeTo(dps);

            if (healerRange <= 3 && healerRange != 1) {
                healer.rangedHeal(dps);
            } else if (healerRange == 1) {
                healer.heal(dps);
            }

            healer.moveTo(dps);

        } else {
            healer.heal(healer);
            healer.moveTo(dps);
        }
    }

    // TANK & HEALER
    if (!dps && tank && healer) {

        var tankClosestHostile = getClosestHostile(tank, hostileCreeps);
        var healerClosestHostile = getClosestHostile(healer. hostileCreeps);

        // TANK ATTACK
        if (tank.getRangeTo(enemySpawn) <= 1) {
            tank.attack(enemySpawn);
        } else {
            if (tankClosestHostile != null) {
                var range = tank.getRangeTo(tankClosestHostile);

                if (range <= 1) {
                    tank.attack(tankClosestHostile);
                }
            }
        }

        // TANK MOVE
        if (tank.getRangeTo(healer) == 1) {

            if (healerClosestHostile && healer.getRangeTo(healerClosestHostile) == 1) {

                tank.moveTo(healerClosestHostile);

            } else {

                var distanceToEnemySpawn = findPath(tank, enemySpawn).length;

                if (closestHostileToSpawn) {
                    if (distanceToEnemySpawn < distanceToSpawn) {
                        tank.moveTo(enemySpawn);
                    } else {
                        tank.moveTo(closestHostileToSpawn)
                    }
                } else {
                    tank.moveTo(enemySpawn);
                }
            }
        }

        // HEALS
        if (tank.hits < tank.hitsMax) {

            var healerRange = healer.getRangeTo(tank);

            if (healerRange <= 3 && healerRange != 1) {
                healer.rangedHeal(tank);
            } else if (healerRange == 1) {
                healer.heal(tank);
            }

            healer.moveTo(tank);

        } else {
            healer.heal(healer);
            healer.moveTo(tank);
        }
    }

    // DPS & HEALER
    if (dps && !tank && healer) {

        var dpsClosestHostile = getClosestHostile(dps, hostileCreeps);
        var healerClosestHostile = getClosestHostile(healer. hostileCreeps);

        if (dps.getRangeTo(enemySpawn) <= 3) {
            dps.rangedAttack(enemySpawn);
        } else {
            if (dpsClosestHostile != null) {
                var range = dps.getRangeTo(dpsClosestHostile);

                if (range <= 3) {
                    dps.rangedAttack(dpsClosestHostile);
                }
            }
        }

        // HEALS
        if (dps.hits < dps.hitsMax) {

            var healerRange = healer.getRangeTo(dps);

            if (healerRange <= 3 && healerRange != 1) {
                healer.rangedHeal(dps);
            } else if (healerRange == 1) {
                healer.heal(dps);
            }

            healer.moveTo(dps);

        } else {
            healer.heal(healer);
            healer.moveTo(dps);
        }
    }

    // TANK
    if (!dps && tank && !healer) {
        
    }

    // HEALER
    if (!dps && !tank && healer) {
        healer.suicide();
    }
}
