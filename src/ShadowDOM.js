if (HTMLElement.prototype.createShadowRoot) {
    console.log('native shadowDOM');
} else if (HTMLElement.prototype.webkitCreateShadowRoot && !HTMLElement.prototype.createShadowRoot) {
    console.log('prefixed shadowDOM');
    Object.defineProperties(Element.prototype, {
        shadowRoot: {
            get: function() {
                return this.webkitShadowRoot;
            }
        },
        createShadowRoot: {
            value: function() {
                return this.webkitCreateShadowRoot();
            }
        }
    });
} else {
    console.log('faked shadowDOM');
    function ShadowRoot(host) {
        this.host = host;
    }

    ShadowRoot.prototype.appendChild = function(child) {
        var composed = renderComposedDOM(child, this.host);
        while (this.host.childNodes.length > 0) {
            this.host.removeChild(this.host.childNodes[0]);
        }
        this.host.appendChild(composed);
    }

    ShadowRoot.prototype.querySelector = function(selector) {
        return this.host.querySelector(selector);
    }

    ShadowRoot.prototype.querySelectorAll = function(selector) {
        return this.host.querySelectorAll(selector);
    }

    function renderComposedDOM(shadow, light) {
        var composed = shadow,
            insertionPoints = composed.querySelectorAll('content');

        var forEach = Array.prototype.forEach;

        forEach.call(insertionPoints, function(node) {
            var selector = node.getAttribute('select') || '*';
            if (selector !== '*') {
                var found = light.querySelectorAll(selector);
                forEach.call(found, function(pt) {
                    node.parentNode.insertBefore(pt, node);
                });
                node.parentNode.removeChild(node);
            } else {
                while (light.childNodes.length > 0) {
                    node.parentNode.insertBefore(light.childNodes[0], node);
                }
                node.parentNode.removeChild(node);
            }
        });
        return composed;
    }

    Object.defineProperties(Element.prototype, {
        shadowRoot: {
            get: function() {
                if (!this.__shadowRoots__ || this.__shadowRoots__.length === 0) return undefined;
                return this.__shadowRoots__[0];
            }
        },
        createShadowRoot: {
            value: function() {
                var that = this;
                if (!this.__shadowRoots__) {
                    this.__shadowRoots__ = [];
                }
                
                var root = new ShadowRoot(this);
                this.__shadowRoots__.push(root);
                return root;
            }
        }
    });
}