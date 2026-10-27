// A group's animations: its video tiles. Started and stopped by an event rule (see events.js), which is how a group's
// Play and Pause buttons decide what they do.

const VIDEO = /\.(mp4|webm|m4v|ogv|mov)(\?.*)?$/i;

/** The video tiles of a group: the parts that animate. */
export function videoTiles(scene, group) {
    return group.members
        .filter((member) => member.type === 'Tile')
        .map((member) => scene.getEmbeddedCollection('Tile').get(member.id))
        .filter((doc) => doc && VIDEO.test(doc._source.texture?.src ?? ''));
}

/**
 * Start or stop every video tile of a group, on every screen. Foundry's own play and pause control does the same to one
 * tile, by an update carrying `playVideo`, which reaches every client; the tile's autoplay is set to match, so a group
 * that was stopped stays stopped when the scene is loaded again.
 * @returns {Promise<number>} How many video tiles there were.
 */
export async function setAnimations(scene, group, play) {
    const tiles = videoTiles(scene, group);
    if (!tiles.length) return 0;
    await scene.updateEmbeddedDocuments('Tile', tiles.map((doc) => ({ _id: doc.id, video: { autoplay: !!play } })), { puppeteer: { follower: true }, diff: false, playVideo: !!play });
    return tiles.length;
}
