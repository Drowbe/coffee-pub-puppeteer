// What a macro or another module can read about a group right now, without reading the record by hand.
import { getGroup } from './store.js';
import { anchorState } from './anchor.js';
import { motionOf } from './tween.js';

/**
 * A group's pose and motion on this client.
 * @returns {null|{id: string, name: string, x: number, y: number, heading: number, moving: boolean, speed: number, progress: number, hidden: boolean, members: number, riders: number, hasToken: boolean}}
 *   `x`, `y` and `heading` are the pin as stored (the group's destination while it is moving). `speed` is in squares a
 *   second and is 0 when the group is still. null when there is no such group.
 */
export function groupState(scene, groupId) {
    const group = getGroup(scene, groupId);
    if (!group) return null;
    const anchor = anchorState(scene, group) ?? group.applied;
    const { moving, speed, progress } = motionOf(scene, group);
    return {
        id: group.id,
        name: group.name,
        x: anchor.x,
        y: anchor.y,
        heading: anchor.heading,
        moving,
        speed: Math.round(speed * 100) / 100,
        progress,
        hidden: !!group.hidden,
        members: group.members.length,
        riders: (group.riders ?? []).length,
        hasToken: !!group.body
    };
}
