document.addEventListener('DOMContentLoaded', () => {
    const mixedContainer = document.createElement('div');
    mixedContainer.id = 'mixed-feed';
    document.body.prepend(mixedContainer);

    document.addEventListener('PostsLoaded', combineFeed);
    document.addEventListener('RequestsLoaded', combineFeed);

    function combineFeed() {
        if (!window.postsForMixing || !window.requestsForMixing) return;
        
        const allItems = [
            ...window.postsForMixing,
            ...window.requestsForMixing
        ].sort((a, b) => b.timestamp - a.timestamp);
        
        mixedContainer.innerHTML = '';
        allItems.forEach(item => {
            mixedContainer.appendChild(item.element.cloneNode(true));
        });
    }
});