// @ts-ignore
import { getObjectsByPrototype, getTicks, findPath, getTerrainAt,createConstructionSite } from 'game/utils';
// @ts-ignore
import { Creep, Structure, StructureSpawn, StructureExtension, StructureWall, StructureContainer, StructureRampart, Source, GameObject, Portal, StructureTower, StructureRoad, ConstructionSite, Resource} from 'game/prototypes';
// @ts-ignore
import { MOVE, CARRY, WORK, ATTACK, RANGED_ATTACK, HEAL, TOUGH, RESOURCE_ENERGY, ERR_NOT_IN_RANGE, BODYPART_COST, TERRAIN_WALL, MAX_CREEP_SIZE } from 'game/constants';
import {findClosestByPath, findClosestByRange } from 'game';

// 1 Miner dedicated to the local source

// @ts-ignore
function getCircleSpawnPosition(creep, mySpawn, clockwise = true) {

    // Define the 8 positions around spawn in clockwise order
    const circlePositions = [
        {x: mySpawn.x, y: mySpawn.y - 1},     // 0: top
        {x: mySpawn.x + 1, y: mySpawn.y - 1}, // 1: top-right
        {x: mySpawn.x + 1, y: mySpawn.y},     // 2: right
        {x: mySpawn.x + 1, y: mySpawn.y + 1}, // 3: bottom-right
        {x: mySpawn.x, y: mySpawn.y + 1},     // 4: bottom
        {x: mySpawn.x - 1, y: mySpawn.y + 1}, // 5: bottom-left
        {x: mySpawn.x - 1, y: mySpawn.y},     // 6: left
        {x: mySpawn.x - 1, y: mySpawn.y - 1}  // 7: top-left
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
    let nextIndex = (currentIndex + direction + 8) % 8;
    let attempts = 0;
    
    // Find next walkable position (skip walls)
    while (attempts < 8) {
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
        nextIndex = (nextIndex + direction + 8) % 8;
        attempts++;
    }
    
    // Fallback to current position
    return {x: creep.x, y: creep.y};
}
function getClosestHostile (creep, hostiles) {
    var closestHostile = null;

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
    return closestHostile;
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
            var newPath = findPath({x:hostile.x, y:hostile.y}, {x:spawn.x, y:spawn.y});
            
            if (newPath.length < oldPath.length) {
                closestHostile = hostile;
            }
        }
        
    }
    return closestHostile;
}
function getClosestContainerOfEnergy(creep, containers) {

    var closestContainer = null;

    for (var q = 0; q < containers.length; q++) {

        var container = containers[q];

        if (container.store.energy > 0) {
            if (closestContainer == null) {
                var path = findPath({x:creep.x, y:creep.y}, {x:container.x, y:container.y});
                if (path) {
                    closestContainer = container;
                }
            } else {

                var newPath = findPath({x:creep.x, y:creep.y}, {x:container.x, y:container.y});
                // @ts-ignore
                var oldPath = findPath({x:creep.x, y:creep.y}, {x:closestContainer.x, y:closestContainer.y});

                if (newPath.length < oldPath.length) {
                    closestContainer = container;
                }
            }
        }
        return closestContainer;
    }

}
function getClosestActiveSource(creep, sources) {
    var closestSource = null;
    var closestDistance = Infinity;

    for (var d = 0; d < sources.length; d++) {
        var source = sources[d];
        
        if (source.energy > 0) {
            var distance = creep.getRangeTo(source);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestSource = source;
            }
        }
    }
    return closestSource;
}
function getBodyPart (body, bodySize, target, part) { // Add all body parts of the same type at once
    for (var i = 0; i < target; i++) { // Iterate up to target part composition
        if (bodySize < MAX_CREEP_SIZE) { // If the current body size is not at maximum
            body.push(part); // Append the body part to the body
            bodySize += 1; // Iterate Body Size
        }
    }
    var results = []; // Array for storing Body and Size together
    results.push(body); // Pack Body
    results.push(bodySize); // Pack Body Size
    return results; // Return Body Array
}
function getMoveAwayPosition(creep, target) {
    const dx = creep.x - target.x;
    const dy = creep.y - target.y;
    
    // Normalize direction
    const dirX = Math.sign(dx) || 1;
    const dirY = Math.sign(dy) || 1;
    
    // Try multiple distances to find valid position
    for (let dist = 4; dist >= 1; dist--) {
        const newX = Math.max(0, Math.min(99, creep.x + dirX * dist));
        const newY = Math.max(0, Math.min(99, creep.y + dirY * dist));
        
        // Check if position is walkable (not a wall)
        const terrain = getTerrainAt({x:newX, y:newY});
        if (terrain !== TERRAIN_WALL) {
            return {x: newX, y: newY};
        }
    }
    
    // If no valid position in preferred direction, try adjacent angles
    const angles = [
        {x: dirX, y: 0},      // Horizontal
        {x: 0, y: dirY},      // Vertical
        {x: -dirX, y: dirY},  // Opposite X
        {x: dirX, y: -dirY}   // Opposite Y
    ];
    
    for (let angle of angles) {
        for (let dist = 4; dist >= 1; dist--) {
            const newX = Math.max(0, Math.min(99, creep.x + angle.x * dist));
            const newY = Math.max(0, Math.min(99, creep.y + angle.y * dist));
            
            const terrain = getTerrainAt({x:newX, y:newY});
            if (terrain !== TERRAIN_WALL) {
                return {x: newX, y: newY};
            }
        }
    }
    
    return {x: creep.x, y: creep.y}; // Fallback to current position
}
function getThreatInRange(creep, hostiles, maxRange = 3) {  // Changed from 2 to 3
    for (let i = 0; i < hostiles.length; i++) {
        const hostile = hostiles[i];
        const range = creep.getRangeTo(hostile);
        if (range <= maxRange) {
            return hostile;
        }
    }
    return null;
}
function getCreepBody (workTarget, moveTarget, carryTarget, attackTarget, rangedTarget, healTarget, claimTarget, toughTarget) { // Get Creep Body for Spawning
    var body = []; // Empty body array for building
    var bodySize = 0; // Track body size
    var bodyParts = [ // Define body parts and their corresponding target number of parts
        { target: toughTarget, part: TOUGH },
        { target: moveTarget, part: MOVE },
        { target: carryTarget, part: CARRY },
        { target: workTarget, part: WORK },
        { target: healTarget, part: HEAL },
        { target: attackTarget, part: ATTACK },
        { target: rangedTarget, part: RANGED_ATTACK }
    ];

    for (var i = 0; i < bodyParts.length; i++) { // Iterate through body parts and add them to the body
        var results = getBodyPart(body, bodySize, bodyParts[i].target, bodyParts[i].part); // Append the next Part to the Body
        body = results[0]; // Unpack the body
        bodySize = results[1]; // Unpack the body size
    }

    return body; // Return completed body for spawning
}
function portalSearch (portals, portalDiscovery, mySpawn, enemySpawn) {

    const numberOfPairs = portalDiscovery.length;


    if (numberOfPairs != 8) {
        for (var p = 0; p < portals.length; p++) {
            var portal = portals[p];
            if (!portal.destination) {
                return portal;
            }
        }
    } else {
        var enemyExitPortal = null;
        var enemyEntrancePortal = null;
        var myExitPortal = null;
        var myEntrancePortal = null;

        for (var pairA = 0; pairA < numberOfPairs; pairA++) {

            var currentPair = portalDiscovery[pairA];

            if (enemySpawn.getRangeTo(currentPair[0].destination <= 3)) {
                enemyExitPortal = currentPair[0];
                enemyEntrancePortal = currentPair[1];
            } 

            if (enemySpawn.getRangeTo(currentPair[1].destination <= 3)) {
                enemyExitPortal = currentPair[1];
                enemyEntrancePortal = currentPair[0];
            }

            return enemyEntrancePortal;
        }
    }
}
function getEmptyExtension (creep, extensions) {
    for (var e = 0; e < extensions.length; e++) {
        var extension = extensions[e];
        if (extension.my && creep.getRangeTo(extension) == 1 && extension.store.getUsedCapacity(RESOURCE_ENERGY) < 100) {
            return extension;
        }
    }
    return null;
}

export function loop() {
    
    const creeps = getObjectsByPrototype(Creep);
    //const portals = getObjectsByPrototype(Portal);
    const spawns = getObjectsByPrototype(StructureSpawn);
    const sources = getObjectsByPrototype(Source);
    const extensions = getObjectsByPrototype(StructureExtension).filter(i => i.my);
    // @ts-ignore
    const roads = getObjectsByPrototype(StructureRoad).filter(i => i.my);
    const ramparts = getObjectsByPrototype(StructureRampart).filter(i => i.my)
    const site = getObjectsByPrototype(ConstructionSite).find(i => i.my)

    var myCreeps = [];
    var hostileCreeps = [];

    for (var a = 0; a < spawns.length; a++) {
        var currentSpawn = spawns[a];
        if (currentSpawn.my) {
            var mySpawn = currentSpawn;
        } else {
            var enemySpawn = currentSpawn;
        }
    }

    var extOne;
    var extTwo;
    var extThree;
    var extFour;
    var extFive;
    var extSix;
    var extSeven;
    var extEight;
    var extNine;
    var extTen;

    var rampartOne;
    var rampartTwo;
    var rampartThree;
    var rampartFour;

    var roadOne;
    var roadTwo;

    if (mySpawn.x == 94) {

        roadOne = {x: 97, y: 1}
        roadTwo = {x: 98, y: 2}

        rampartOne = {x: 97, y: 2}
        rampartTwo = {x: 96, y: 3}
        rampartThree = {x: 95, y: 4}
        rampartFour = {x: 93, y: 6}

        extOne = {x: 96, y: 3}
        extTwo = {x: 97, y: 3}
        extThree = {x: 95, y: 3}
        extFour = {x: 96, y: 4}
        extFive = {x: 94, y: 4}
        extSix = {x: 95, y: 5}
        extSeven = {x: 95, y: 2}
        extEight = {x: 97, y: 4}
        extNine = {x: 94, y: 3}
        extTen = {x: 96, y: 5}
    } else {
        roadOne = {x: 1, y: 97}
        roadTwo = {x: 2, y: 98}

        rampartOne = {x: 2, y: 97}
        rampartTwo = {x: 3, y: 96}
        rampartThree = {x: 4, y: 95}
        rampartFour = {x: 6, y: 93}

        extOne = {x: 3, y: 96}
        extTwo = {x: 3, y: 97}
        extThree = {x: 3, y: 95}
        extFour = {x: 4, y: 96}
        extFive = {x: 4, y: 94}
        extSix = {x: 5, y: 95}
        extSeven = {x: 2, y: 95}
        extEight = {x: 4, y: 97}
        extNine = {x: 3, y: 94}
        extTen = {x: 5, y: 96}
    }

    if (!site) {
        if (roads.length < 2) {
            
            switch (roads.length) {
                    case 0:
                        createConstructionSite(roadOne, StructureRoad);
                        break;
                    case 1:
                        createConstructionSite(roadTwo, StructureRoad);
                        break;
                }
        } else {

            if (ramparts.length < 4) {

                switch (ramparts.length) {
                    case 0:
                        createConstructionSite(mySpawn, StructureRampart);
                        break;
                    case 1:
                        createConstructionSite(rampartOne, StructureRampart);
                        break;
                    case 2:
                        createConstructionSite(rampartTwo, StructureRampart);
                        break;
                    case 3:
                        createConstructionSite(rampartThree, StructureRampart);
                        break;
                }
                
            } else {

                
                switch (extensions.length) {
                    case 0:
                        createConstructionSite(extOne, StructureExtension);
                        break;
                    /*case 1:
                        createConstructionSite(extTwo, StructureExtension);
                        break;
                    case 2:
                        createConstructionSite(extThree, StructureExtension);
                        break;
                    case 3:
                        createConstructionSite(extFour, StructureExtension);
                        break;
                    case 4:
                        createConstructionSite(extFive, StructureExtension);
                        break;
                    case 5:
                        createConstructionSite(extSix, StructureExtension);
                        break;
                    case 6:
                        createConstructionSite(extSeven, StructureExtension);
                        break;
                    case 7:
                        createConstructionSite(extEight, StructureExtension);
                        break;
                    case 8:
                        createConstructionSite(extNine, StructureExtension);
                        break;
                    case 9:
                        createConstructionSite(extTen, StructureExtension);
                        break;*/
                }
            }
        }
    }

    /*var portalDiscovery = []

    for (var y = 0; y < portals.length; y++) {
        var portal = portals[y];

        // @ts-ignore
        if (portal.destination) {
            var newPair = [];
            // @ts-ignore
            newPair.push(portal.destination);
            for (var z = 0; z < portals.length; z++) {
                var pairedPortal = portals[z];
                // @ts-ignore
                if (newPair[0] == pairedPortal.destination) {
                    // @ts-ignore
                    newPair.push(pairedPortal.destination);
                    portalDiscovery.push(newPair);
                }
            }
        }
    }*/
    var miners = []
    var miner = null;
    var chainlink = null;
    var guard = null;

    for (var b = 0; b < creeps.length; b++) {

        var currentCreep = creeps[b];

        if (currentCreep.my && !currentCreep.spawning) {

            myCreeps.push(currentCreep)

            for (var c = 0; c < creeps.length; c++) {
                var enemyCreep = creeps[c];
                if (!enemyCreep.my) {
                    hostileCreeps.push(enemyCreep);
                }
            }
        }
    }
    

    var energyAvailable = mySpawn.store.energy;

    if (!mySpawn.spawning) { 


        switch (myCreeps.length) {
            case 0:
                var cost = (BODYPART_COST[WORK] + BODYPART_COST[MOVE]);
                var workParts = Math.min(Math.floor((energyAvailable - (BODYPART_COST[CARRY])) / cost), 5);
                var carryParts = 1;
                var moveParts = workParts;
                var body = getCreepBody(workParts, moveParts, carryParts, 0, 0, 0, 0, 0);
                mySpawn.spawnCreep(body).object;
                break;
            case 1:
                mySpawn.spawnCreep([MOVE, CARRY, WORK]).object;
                break;
            case 2:
                mySpawn.spawnCreep([MOVE, CARRY, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK]).object;
                break;
        }

        if (myCreeps.length >= 3 && energyAvailable >= 1000) {
            var cost = (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]);
            var rangedParts = Math.min(Math.floor(energyAvailable / cost), 25);
            var moveParts = rangedParts;
            var body = getCreepBody(0, moveParts, 0, 0, rangedParts, 0, 0, 0);
            mySpawn.spawnCreep(body).object;
                
        }
        
    }



    /*var eExt;

    if (miner) { // Miner

        var source = findClosestByRange(miner, sources); // Get closest Source
        
        if (miner.store.getUsedCapacity() < miner.store.getCapacity()) { // If miners store is not full

            if (miner.getRangeTo(source) > 1) {
                miner.moveTo(source); // Mpve to source
            } else {
                miner.harvest(source); // Harvest it
            }

        } else { // Miner store is full

            eExt = getEmptyExtension(miner, extensions); // Filling extensions has the same effect of filling the spawn and can act as a kind of link, fill first

            if (eExt) { // If a extension next to miner can be filled
                miner.transfer(eExt, RESOURCE_ENERGY); // Fill extension
            } else {

                if (chainlink) { // Let chain link do the transfer

                    if (chainlink.store.getUsedCapacity() < chainlink.store.getCapacity()) {
                        if (chainlink.getRangeTo(miner) > 1) {
                            chainlink.moveTo(rampartTwo);
                        } else {
                            if (miner.getRangeTo(chainlink) == 1) {
                                miner.transfer(chainlink, RESOURCE_ENERGY);
                            }
                        }

                    } else {

                        eExt = getEmptyExtension(chainlink, extensions);

                        if (eExt) {
                            chainlink.transfer(eExt, RESOURCE_ENERGY);
                        } else {

                            if (guard) {

                                if (guard.store.getUsedCapacity() < guard.store.getCapacity()) {
                                    chainlink.transfer(guard, RESOURCE_ENERGY);
                                } else {

                                    eExt = getEmptyExtension(guard, extensions);

                                    if (eExt) {
                                        guard.transfer(eExt, RESOURCE_ENERGY);
                                    } else {
                                        guard.transfer(mySpawn, RESOURCE_ENERGY);
                                    }
                                    
                                }

                                if (site) {
                                    chainlink.build(site);
                                }

                            } else {

                                if (chainlink.getRangeTo(mySpawn) > 1) {
                                    chainlink.moveTo(mySpawn);
                                } else {
                                    chainlink.transfer(mySpawn, RESOURCE_ENERGY);
                                }
                            }
                        }
                        
                    }
                    
                } else { //Make miner do the transfer on your own

                    if (miner.getRangeTo(mySpawn) > 1) {
                        miner.moveTo(mySpawn);
                    } else {
                        miner.transfer(mySpawn, RESOURCE_ENERGY);
                    }
                }
            }
        }
    }

    if (chainlink) {
        if (chainlink.getRangeTo(miner) != 1) {
            chainlink.moveTo(rampartTwo);
        }
    }

    if (guard) { // Check for enemies to attack

        var closestHostile = getClosestHostile(guard, hostileCreeps);

        if (closestHostile) {
            var range = guard.getRangeTo(closestHostile);
            if (range <= 3) {
                guard.rangedAttack(closestHostile);
            }
        }

        if (guard.getRangeTo(mySpawn) > 1) {
            guard.moveTo(rampartThree);
        } else {
            if (guard.getRangeTo(chainlink) > 1) {
                guard.moveTo(rampartThree);
            }
        }
    }
    
    var closestHostileToSpawn = getClosestHostileToSpawn(mySpawn, hostileCreeps);

    for (var v = 3; v < myCreeps.length; v++) {

        var warrior = myCreeps[v];

        // Send them off to war!
        if (closestHostileToSpawn) {

            if (warrior.getRangeTo(closestHostileToSpawn) <= 3) {
                warrior.rangedAttack(closestHostileToSpawn);
            } 

            var threat = getThreatInRange(warrior, hostileCreeps, 2);

            if (threat) {
                var retreat = getMoveAwayPosition(warrior, threat);
                warrior.moveTo(retreat);
            } else {
                warrior.moveTo(closestHostileToSpawn);
            }

        } else {

            if (warrior.rangedAttack(enemySpawn) == ERR_NOT_IN_RANGE) {
                warrior.moveTo(enemySpawn);
            }
        }
        
    }*/
}
