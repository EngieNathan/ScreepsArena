import { getObjectsByPrototype, getTicks, findPath, getTerrainAt, getDirection } from 'game/utils';
import { Flag, Creep, StructureSpawn, StructureWall, StructureRampart,  } from 'game/prototypes';
import { MOVE, CARRY, WORK, ATTACK, RANGED_ATTACK, HEAL, TOUGH, RESOURCE_ENERGY, ERR_NOT_IN_RANGE, BODYPART_COST, TERRAIN_WALL, TERRAIN_SWAMP } from 'game/constants';


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
