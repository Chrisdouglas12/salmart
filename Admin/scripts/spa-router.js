// Lightweight SPA Router - Preserves all existing functionality
class LightweightSPARouter {
    constructor() {
        this.cache = new Map(); // Cache loaded pages
        this.currentPage = window.location.pathname.split('/').pop() || 'index.html';
        this.init();
    }

    init() {
        // Only intercept main navigation links
        this.interceptNavigation();
        
        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.url) {
                this.loadPage(e.state.url, false);
            }
        });

        // Set initial state
        history.replaceState({ url: this.currentPage }, '', this.currentPage);
    }

    interceptNavigation() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && this.shouldIntercept(link)) {
                e.preventDefault();
                const href = link.getAttribute('href');
                this.navigateTo(href);
            }
        });
    }

    shouldIntercept(link) {
        const href = link.getAttribute('href');
        
        // Don't intercept external links, anchors, etc.
        if (!href || 
            href.startsWith('http') || 
            href.startsWith('mailto:') || 
            href.startsWith('tel:') ||
            href === '#' ||
            href.startsWith('javascript:') ||
            link.hasAttribute('download') ||
            link.hasAttribute('target')) {
            return false;
        }

        // Only intercept main navigation pages
        const navPages = [
            'index.html',
            'Alerts.html', 
            'Messages.html',
            'Deals.html',
            'Profile.html',
            'requestlists.html'
        ];

        // Check if link is in navbar or sidebar (main navigation)
        const isNavLink = link.closest('#navbar') || link.closest('.side-bar');
        const isNavPage = navPages.some(page => href.includes(page));
        
        return isNavLink && isNavPage;
    }

    async navigateTo(url) {
        // Show loading state
        this.showLoading();
        
        try {
            // Update URL first
            history.pushState({ url: url }, '', url);
            
            // Load the complete new page
            await this.loadPage(url, true);
            
        } catch (error) {
            console.error('Navigation failed:', error);
            // Fallback to normal navigation
            window.location.href = url;
        }
    }

    async loadPage(url, addToHistory = true) {
        try {
            // Check cache first
            let pageData = this.cache.get(url);
            
            if (!pageData) {
                // Fetch the complete page
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const html = await response.text();
                pageData = { html, timestamp: Date.now() };
                
                // Cache for 5 minutes
                this.cache.set(url, pageData);
            }
            
            // Replace entire page content except for what should persist
            this.replacePage(pageData.html);
            
            // Update current page reference
            this.currentPage = url;
            
        } catch (error) {
            throw error;
        }
    }

    replacePage(newHTML) {
        const parser = new DOMParser();
        const newDoc = parser.parseFromString(newHTML, 'text/html');
        
        // Elements that should persist across page changes
        const persistentElements = this.savePersistentElements();
        
        // Replace the entire body content
        document.body.innerHTML = newDoc.body.innerHTML;
        
        // Restore persistent elements
        this.restorePersistentElements(persistentElements);
        
        // Update head elements (title, meta, etc.)
        this.updateHead(newDoc);
        
        // Reinitialize everything
        this.reinitializePage(newDoc);
        
        this.hideLoading();
    }

    savePersistentElements() {
        const persistent = {};
        
        // Save elements that should persist (like user auth state, socket connections)
        // Note: Most of your app state is in localStorage, so this handles UI state
        
        return persistent;
    }

    restorePersistentElements(persistent) {
        // Restore any elements that should persist
        // In your case, most state is in localStorage, so minimal restoration needed
    }

    updateHead(newDoc) {
        // Update title
        const newTitle = newDoc.querySelector('title');
        if (newTitle) {
            document.title = newTitle.textContent;
        }

        // Update meta description
        const newDescription = newDoc.querySelector('meta[name="description"]');
        let currentDescription = document.querySelector('meta[name="description"]');
        
        if (newDescription) {
            if (currentDescription) {
                currentDescription.setAttribute('content', newDescription.getAttribute('content'));
            } else {
                // Create meta description if it doesn't exist
                currentDescription = document.createElement('meta');
                currentDescription.name = 'description';
                currentDescription.content = newDescription.getAttribute('content');
                document.head.appendChild(currentDescription);
            }
        }

        // Update CSS files - this is the key fix!
        this.updateStylesheets(newDoc);
    }

    updateStylesheets(newDoc) {
        // Get all link tags from the new page
        const newStylesheets = Array.from(newDoc.querySelectorAll('link[rel="stylesheet"]'));
        const currentStylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        
        // Create a set of current stylesheet hrefs for comparison
        const currentHrefs = new Set(currentStylesheets.map(link => link.href));
        
        // Add new stylesheets that aren't already loaded
        newStylesheets.forEach(newLink => {
            const href = newLink.getAttribute('href');
            const fullHref = new URL(href, window.location.origin).href;
            
            if (!currentHrefs.has(fullHref)) {
                // Create new link element
                const linkElement = document.createElement('link');
                linkElement.rel = 'stylesheet';
                linkElement.href = href;
                
                // Add any other attributes from the original
                Array.from(newLink.attributes).forEach(attr => {
                    if (attr.name !== 'rel' && attr.name !== 'href') {
                        linkElement.setAttribute(attr.name, attr.value);
                    }
                });
                
                document.head.appendChild(linkElement);
                console.log('✅ Loaded stylesheet:', href);
            }
        });

        // Optional: Remove stylesheets that are no longer needed
        // (Comment this out if you want to keep all loaded stylesheets)
        /*
        const newHrefs = new Set(newStylesheets.map(link => 
            new URL(link.getAttribute('href'), window.location.origin).href
        ));
        
        currentStylesheets.forEach(currentLink => {
            const href = currentLink.href;
            // Don't remove common stylesheets (utils, main, etc.)
            const isCommonStylesheet = href.includes('utils.css') || 
                                     href.includes('main.css') || 
                                     href.includes('font-awesome') ||
                                     href.includes('googleapis.com');
            
            if (!newHrefs.has(href) && !isCommonStylesheet) {
                currentLink.remove();
                console.log('🗑️ Removed stylesheet:', href);
            }
        });
        */
    }

    reinitializePage(newDoc) {
        // Re-execute all scripts from the new page
        this.executeScripts(newDoc);
        
        // Reinitialize common features
        setTimeout(() => {
            this.initializeCommonFeatures();
        }, 100);
        
        // Scroll to top
        window.scrollTo(0, 0);
    }

    executeScripts(newDoc) {
        // Get scripts from the new page's head and body
        const headScripts = Array.from(newDoc.querySelectorAll('head script'));
        const bodyScripts = Array.from(newDoc.querySelectorAll('body script'));
        const allNewScripts = [...headScripts, ...bodyScripts];
        
        // Keep track of loaded scripts
        const currentScripts = Array.from(document.querySelectorAll('script[src]'));
        const currentSrcs = new Set(currentScripts.map(script => script.src));
        
        allNewScripts.forEach(script => {
            if (script.src) {
                // External script - load if not already loaded
                const fullSrc = new URL(script.getAttribute('src'), window.location.origin).href;
                
                if (!currentSrcs.has(fullSrc)) {
                    const newScript = document.createElement('script');
                    newScript.src = script.getAttribute('src');
                    newScript.type = script.type || 'text/javascript';
                    
                    // Copy other attributes
                    Array.from(script.attributes).forEach(attr => {
                        if (attr.name !== 'src' && attr.name !== 'type') {
                            newScript.setAttribute(attr.name, attr.value);
                        }
                    });
                    
                    document.head.appendChild(newScript);
                    console.log('✅ Loaded script:', script.getAttribute('src'));
                }
            } else if (script.textContent.trim()) {
                // Inline script - execute in a way that preserves scope
                try {
                    const scriptContent = script.textContent;
                    // Create script element and append to execute
                    const newScript = document.createElement('script');
                    newScript.textContent = scriptContent;
                    document.head.appendChild(newScript);
                    // Remove immediately after execution
                    newScript.remove();
                } catch (error) {
                    console.warn('Script execution error:', error);
                }
            }
        });
    }

    initializeCommonFeatures() {
        // Reinitialize features that might need restart
        
        // Menu toggle functionality
        const menuIcon = document.querySelector('.menu-icon');
        const sideBar = document.querySelector('.side-bar');
        if (menuIcon && sideBar) {
            // Re-attach event listeners (they get lost with innerHTML replacement)
            this.initMenuToggle();
        }
        
        // Reinitialize navigation badges
        if (window.updateBadges) {
            window.updateBadges();
        }
        
        // Reinitialize any page-specific functionality
        if (window.initPageFeatures) {
            window.initPageFeatures();
        }

        // Reinitialize Socket.IO if needed
        if (window.socket && !window.socket.connected) {
            window.socket.connect();
        }
    }

    initMenuToggle() {
        const menuIcon = document.querySelector('.menu-icon');
        const sideBar = document.querySelector('.side-bar');
        const body = document.body;

        if (menuIcon && sideBar) {
            menuIcon.addEventListener('click', () => {
                const isOpen = sideBar.style.display === 'block';
                sideBar.style.display = isOpen ? 'none' : 'block';
                body.classList.toggle('no-scroll', !isOpen);
            });

            document.body.addEventListener('click', (e) => {
                const clickedOutsideSidebar = !sideBar.contains(e.target) && !menuIcon.contains(e.target);
                const sidebarOpen = sideBar.style.display === 'block';

                if (sidebarOpen && clickedOutsideSidebar) {
                    sideBar.style.display = 'none';
                    body.classList.remove('no-scroll');
                }
            });
        }
    }

    showLoading() {
        // Create or show loading overlay
        let loader = document.getElementById('spa-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'spa-loader';
            loader.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255,255,255,0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                ">
                    <div style="
                        width: 40px;
                        height: 40px;
                        border: 3px solid #f3f3f3;
                        border-top: 3px solid #28a745;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
            document.body.appendChild(loader);
        }
        loader.style.display = 'block';
    }

    hideLoading() {
        const loader = document.getElementById('spa-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on main navigation pages
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const spaPages = ['index.html', 'Alerts.html', 'Messages.html', 'Deals.html', 'Profile.html', 'requestlists.html'];
    
    if (spaPages.some(page => currentPage === page || currentPage === '')) {
        window.lightSPARouter = new LightweightSPARouter();
        console.log('✅ Lightweight SPA Router initialized');
    }
});

// Utility for programmatic navigation
window.spaNavigate = function(url) {
    if (window.lightSPARouter) {
        window.lightSPARouter.navigateTo(url);
    } else {
        window.location.href = url;
    }
};