import { getObjectsByPrototype, getTicks, findPath, getTerrainAt, getDirection } from 'game/utils';
import { Flag, Creep, StructureSpawn, StructureWall, StructureRampart} from 'game/prototypes';
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
function getKiteDistanceUntilCornered(creep, hostiles) {
    // Filter for melee hostiles
    const meleeHostiles = hostiles.filter(h => {
        if (!h.body || h.body.length === 0) return false;
        
        const hasAttack = h.body.some(part => part.type === ATTACK);
        const hasRanged = h.body.some(part => part.type === RANGED_ATTACK);
        
        // Consider it melee if it has ATTACK but no RANGED_ATTACK
        // Or if it has neither (basic creep with only MOVE/TOUGH)
        return hasAttack && !hasRanged || (!hasAttack && !hasRanged);
    });
    
    if (meleeHostiles.length === 0) {
        return -1;
    }
    
    // Find the closest melee hostile
    let closestMelee = null;
    let minDistance = Infinity;
    
    for (const hostile of meleeHostiles) {
        const dist = Math.max(Math.abs(creep.x - hostile.x), Math.abs(creep.y - hostile.y));
        if (dist < minDistance) {
            minDistance = dist;
            closestMelee = hostile;
        }
    }
    
    if (!closestMelee) return -1;
    
    return calculateKiteDistance(creep, closestMelee);
}
function calculateKiteDistance(creep, closestMelee) {
    // Calculate the direction away from the melee unit
    const dx = creep.x - closestMelee.x;
    const dy = creep.y - closestMelee.y;
    
    // If already adjacent or on top of melee unit
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    if (distance <= 1) {
        return 0;
    }
    
    // Get the kite direction (opposite of melee unit)
    const kiteDirection = {
        x: dx === 0 ? 0 : (dx > 0 ? 1 : -1),
        y: dy === 0 ? 0 : (dy > 0 ? 1 : -1)
    };
    
    // Simulate kiting path
    let kiteDistance = 0;
    let currentX = creep.x;
    let currentY = creep.y;
    const visitedPositions = new Set([`${currentX},${currentY}`]);
    
    while (kiteDistance < 50) {
        // Calculate next position
        let nextX = currentX + kiteDirection.x;
        let nextY = currentY + kiteDirection.y;
        
        // Check if we can move to this position
        if (isPositionValid(nextX, nextY, creep)) {
            currentX = nextX;
            currentY = nextY;
            visitedPositions.add(`${currentX},${currentY}`);
            kiteDistance++;
        } else {
            // Check if we're cornered
            const availableMoves = getAvailableMoves(currentX, currentY, creep, visitedPositions);
            
            if (availableMoves.length === 0) {
                break; // Cornered
            } else {
                // Try to continue in a similar direction
                let bestMove = null;
                let bestScore = -1;
                
                for (const move of availableMoves) {
                    // Score based on similarity to kite direction
                    const moveDx = move.x - currentX;
                    const moveDy = move.y - currentY;
                    const score = (moveDx * kiteDirection.x) + (moveDy * kiteDirection.y);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = move;
                    }
                }
                
                if (bestMove) {
                    currentX = bestMove.x;
                    currentY = bestMove.y;
                    visitedPositions.add(`${currentX},${currentY}`);
                    kiteDistance++;
                } else {
                    break;
                }
            }
        }
    }
    
    return kiteDistance;
}

function isPositionValid(x, y, creep) {
    // Check bounds
    if (x < 0 || x >= 100 || y < 0 || y >= 100) {
        return false;
    }
    
    // Check terrain using getTerrainAt
    const terrain = getTerrainAt({x: x, y: y});
    if (terrain === TERRAIN_WALL) {
        return false;
    }
    
    // Check for other creeps
    const allCreeps = getObjectsByPrototype(Creep);
    for (const c of allCreeps) {
        if (c.id !== creep.id && c.x === x && c.y === y) {
            return false;
        }
    }
    
    // Swamps are traversable but slow
    return true;
}

function getAvailableMoves(x, y, creep, visitedPositions) {
    const moves = [];
    const directions = [
        { x: x - 1, y: y - 1 },
        { x: x, y: y - 1 },
        { x: x + 1, y: y - 1 },
        { x: x - 1, y: y },
        { x: x + 1, y: y },
        { x: x - 1, y: y + 1 },
        { x: x, y: y + 1 },
        { x: x + 1, y: y + 1 }
    ];
    
    for (const dir of directions) {
        const key = `${dir.x},${dir.y}`;
        if (!visitedPositions.has(key) && isPositionValid(dir.x, dir.y, creep)) {
            moves.push(dir);
        }
    }
    
    return moves;
}
