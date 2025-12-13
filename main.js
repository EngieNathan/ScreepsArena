
import { getObjectsByPrototype } from 'game/utils';
import { Structure, Creep, StructureSpawn, Source} from 'game/prototypes';
import { MOVE, CARRY, WORK, ATTACK, RANGED_ATTACK, HEAL, RESOURCE_ENERGY, ERR_NOT_IN_RANGE } from 'game/constants';

export function loop() {

    var sources = getObjectsByPrototype(Source);
    var spawns = getObjectsByPrototype(StructureSpawn);
    var creeps = getObjectsByPrototype(Creep);
    var source = sources[0];
    var spawn = spawns[0];
    var miners = 0, warriors = 0, rangers = 0, healers = 0;
    const structures = getObjectsByPrototype(Structure);
    console.log(structures.map(s => s.constructor.name));
    for (var i = 0; i < creeps.length; i++) { // Creeps

        var currentCreep = creeps[i]

        if (currentCreep.my) { // My Creeps

            if (currentCreep.body.some(bodyPart => bodyPart.type == WORK)) { // Miners
                miners += 1;

                if (currentCreep.store.getFreeCapacity(RESOURCE_ENERGY)) { // Free Space
                    if (currentCreep.harvest(source) == ERR_NOT_IN_RANGE) {
                        currentCreep.moveTo(source);
                    }
                } else { // Full
                    if(currentCreep.transfer(spawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                        currentCreep.moveTo(spawn);
                    }
                }

                continue;

            } else if (currentCreep.body.some(bodyPart => bodyPart.type == RANGED_ATTACK)) { // Rangers

                for (var l = 0; l < creeps.length; l++) {

                    if (!creeps[l].my) {

                        var enemyCreep = creeps[l];

                        if (enemyCreep.body.some(bodyPart => bodyPart.type == HEAL)) { // Attack healers first

                            if (currentCreep.getRangeTo(enemyCreep) <= 3) {
                                currentCreep.rangedAttack(enemyCreep);
                            }

                        } else if (enemyCreep.body.some(bodyPart => bodyPart.type == ATTACK)) { // Attack Warriors second

                            if (currentCreep.getRangeTo(enemyCreep) <= 3) {
                                currentCreep.rangedAttack(enemyCreep);
                            }

                        } else {

                            if (currentCreep.getRangeTo(enemyCreep) <= 3) {
                                currentCreep.rangedAttack(enemyCreep);
                            }
                        }
                    }
                }
            }
        }
    }


    var energy = spawn.store.energy;

    if (miners < 5 && energy > 200) {
        spawn.spawnCreep([CARRY, MOVE, WORK]).object;

    } else if (energy > 300) {
        spawn.spawnCreep([RANGED_ATTACK, RANGED_ATTACK]).object;
    }

}
