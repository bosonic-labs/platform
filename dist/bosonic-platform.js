if (!window.Platform) {
    window.Platform = {
        name: 'bosonic'
    };
}
/*!
Copyright (C) 2014 by WebReflection

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
(function(window, document, Object, REGISTER_ELEMENT){'use strict';

// in case it's there or already patched
if (REGISTER_ELEMENT in document) return;

var
  // IE < 11 only + old WebKit for attributes + feature detection
  EXPANDO_UID = '__' + REGISTER_ELEMENT + (Math.random() * 10e4 >> 0),

  // shortcuts and costants
  EXTENDS = 'extends',
  DOM_ATTR_MODIFIED = 'DOMAttrModified',
  DOM_SUBTREE_MODIFIED = 'DOMSubtreeModified',

  // valid and invalid node names
  validName = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/,
  invalidNames = [
    'ANNOTATION-XML',
    'COLOR-PROFILE',
    'FONT-FACE',
    'FONT-FACE-SRC',
    'FONT-FACE-URI',
    'FONT-FACE-FORMAT',
    'FONT-FACE-NAME',
    'MISSING-GLYPH'
  ],

  // registered types and their prototypes
  types = [],
  protos = [],

  // to query subnodes
  query = '',

  // html shortcut used to feature detect
  documentElement = document.documentElement,

  // ES5 inline helpers || basic patches
  indexOf = types.indexOf || function (v) {
    for(var i = this.length; i-- && this[i] !== v;){}
    return i;
  },

  // other helpers / shortcuts
  OP = Object.prototype,
  hOP = OP.hasOwnProperty,
  iPO = OP.isPrototypeOf,

  defineProperty = Object.defineProperty,
  gOPD = Object.getOwnPropertyDescriptor,
  gOPN = Object.getOwnPropertyNames,
  gPO = Object.getPrototypeOf,
  sPO = Object.setPrototypeOf,

  hasProto = !!Object.__proto__,

  // used to create unique instances
  create = Object.create || function Bridge(proto) {
    // silly broken polyfill probably ever used but short enough to work
    return proto ? ((Bridge.prototype = proto), new Bridge) : this;
  },

  // will set the prototype if possible
  // or copy over all properties
  setPrototype = sPO || (
    hasProto ?
      function (o, p) {
        o.__proto__ = p;
        return o;
      } : (
    gOPD ?
      (function(){
        function setProperties(o, p) {
          for (var
            key,
            names = gOPN(p),
            i = 0, length = names.length;
            i < length; i++
          ) {
            key = names[i];
            if (!hOP.call(o, key)) {
              defineProperty(o, key, gOPD(p, key));
            }
          }
        }
        return function (o, p) {
          do {
            setProperties(o, p);
          } while (p = gPO(p));
          return o;
        };
      }()) :
      function (o, p) {
        for (var key in p) {
          o[key] = p[key];
        }
        return o;
      }
  )),

  // based on setting prototype capability
  // will check proto or the expando attribute
  // in order to setup the node once
  patchIfNotAlready = sPO || hasProto ?
    function (node, proto) {
      if (!iPO.call(proto, node)) {
        setupNode(node, proto);
      }
    } :
    function (node, proto) {
      if (!node[EXPANDO_UID]) {
        node[EXPANDO_UID] = Object(true);
        setupNode(node, proto);
      }
    }
  ,

  // DOM shortcuts and helpers, if any

  MutationObserver = window.MutationObserver ||
                     window.WebKitMutationObserver,

  HTMLElementPrototype = (
    window.HTMLElement ||
    window.Element ||
    window.Node
  ).prototype,

  cloneNode = HTMLElementPrototype.cloneNode,
  setAttribute = HTMLElementPrototype.setAttribute,

  // replaced later on
  createElement = document.createElement,

  // shared observer for all attributes
  attributesObserver = MutationObserver && {
    attributes: true,
    characterData: true,
    attributeOldValue: true
  },

  // useful to detect only if there's no MutationObserver
  DOMAttrModified = MutationObserver || function(e) {
    doesNotSupportDOMAttrModified = false;
    documentElement.removeEventListener(
      DOM_ATTR_MODIFIED,
      DOMAttrModified
    );
  },

  // internal flags
  setListener = false,
  doesNotSupportDOMAttrModified = true,
  initialTrigger = 0,

  // optionally defined later on
  onSubtreeModified,
  callDOMAttrModified,
  getAttributesMirror,
  observer
;

if (!MutationObserver) {
  documentElement.addEventListener(DOM_ATTR_MODIFIED, DOMAttrModified);
  documentElement.setAttribute(EXPANDO_UID, 1);
  documentElement.removeAttribute(EXPANDO_UID);
  if (doesNotSupportDOMAttrModified) {
    onSubtreeModified = function (e) {
      var
        node = this,
        oldAttributes,
        newAttributes,
        key
      ;
      if (node === e.target) {
        oldAttributes = node[EXPANDO_UID];
        node[EXPANDO_UID] = (newAttributes = getAttributesMirror(node));
        for (key in newAttributes) {
          if (!(key in oldAttributes)) {
            // attribute was added
            return callDOMAttrModified(
              0,
              node,
              key,
              oldAttributes[key],
              newAttributes[key],
              'ADDITION'
            );
          } else if (newAttributes[key] !== oldAttributes[key]) {
            // attribute was changed
            return callDOMAttrModified(
              1,
              node,
              key,
              oldAttributes[key],
              newAttributes[key],
              'MODIFICATION'
            );
          }
        }
        // checking if it has been removed
        for (key in oldAttributes) {
          if (!(key in newAttributes)) {
            // attribute removed
            return callDOMAttrModified(
              2,
              node,
              key,
              oldAttributes[key],
              newAttributes[key],
              'REMOVAL'
            );
          }
        }
      }
    };
    callDOMAttrModified = function (
      attrChange,
      currentTarget,
      attrName,
      prevValue,
      newValue,
      action
    ) {
      var e = {
        attrChange: attrChange,
        currentTarget: currentTarget,
        attrName: attrName,
        prevValue: prevValue,
        newValue: newValue
      };
      e[action] = attrChange;
      onDOMAttrModified(e);
    };
    getAttributesMirror = function (node) {
      for (var
        attr,
        result = {},
        attributes = node.attributes,
        i = 0, length = attributes.length;
        i < length; i++
      ) {
        attr = attributes[i];
        result[attr.name] = attr.value;
      }
      return result;
    };
  }
}

function loopAndVerify(list, action) {
  for (var i = 0, length = list.length; i < length; i++) {
    verifyAndSetupAndAction(list[i], action);
  }
}

function loopAndSetup(list) {
  for (var i = 0, length = list.length, node; i < length; i++) {
    node = list[i];
    setupNode(node, protos[getTypeIndex(node)]);
  }
}

function discoverUncaughtElements() {
  initialTrigger = 0;
  loopAndVerify(
    document.querySelectorAll(query),
    'attached'
  );
}

function executeAction(action) {
  return function (node) {
    if (iPO.call(HTMLElementPrototype, node)) {
      verifyAndSetupAndAction(node, action);
      loopAndVerify(
        node.querySelectorAll(query),
        action
      );
    }
  };
}

function getTypeIndex(target) {
  var is = target.getAttribute('is');
  return indexOf.call(
    types,
    is ?
        is.toUpperCase() :
        target.nodeName
  );
}

function onDOMAttrModified(e) {
  var
    node = e.currentTarget,
    attrChange = e.attrChange,
    prevValue = e.prevValue,
    newValue = e.newValue
  ;
  if (node.attributeChangedCallback) {
    node.attributeChangedCallback(
      e.attrName,
      attrChange === e.ADDITION ? null : prevValue,
      attrChange === e.REMOVAL ? null : newValue
    );
  }
}

function onDOMNode(action) {
  var executor = executeAction(action);
  return function (e) {
    executor(e.target);
  };
}

function patchedSetAttribute(name, value) {
  var self = this;
  setAttribute.call(self, name, value);
  onSubtreeModified.call(self, {target: self});
}

function setupNode(node, proto) {
  setPrototype(node, proto);
  if (observer) {
    observer.observe(node, attributesObserver);
  } else {
    if (doesNotSupportDOMAttrModified) {
      node.setAttribute = patchedSetAttribute;
      node[EXPANDO_UID] = getAttributesMirror(node);
      node.addEventListener(DOM_SUBTREE_MODIFIED, onSubtreeModified);
    }
    node.addEventListener(DOM_ATTR_MODIFIED, onDOMAttrModified);
  }
  if (node.createdCallback) {
    node.created = true;
    node.createdCallback();
    node.created = false;
  }
}

function verifyAndSetupAndAction(node, action) {
  var
    fn,
    i = getTypeIndex(node),
    attached = 'attached',
    detached = 'detached'
  ;
  if (-1 < i) {
    patchIfNotAlready(node, protos[i]);
    i = 0;
    if (action === attached && !node[attached]) {
      node[detached] = false;
      node[attached] = true;
      i = 1;
    } else if (action === detached && !node[detached]) {
      node[attached] = false;
      node[detached] = true;
      i = 1;
    }
    if (i && (fn = node[action + 'Callback'])) fn.call(node);
  }
}

// set as enumerable, writable and configurable
document[REGISTER_ELEMENT] = function registerElement(type, options) {
  upperType = type.toUpperCase();
  if (!setListener) {
    // only first time document.registerElement is used
    // we need to set this listener
    // setting it by default might slow down for no reason
    setListener = true;
    if (MutationObserver) {
      observer = (function(attached, detached){
        function checkEmAll(list, callback) {
          for (var i = 0, length = list.length; i < length; callback(list[i++])){}
        }
        return new MutationObserver(function (records) {
          for (var
            current, node,
            i = 0, length = records.length; i < length; i++
          ) {
            current = records[i];
            if (current.type === 'childList') {
              checkEmAll(current.addedNodes, attached);
              checkEmAll(current.removedNodes, detached);
            } else {
              node = current.target;
              if (node.attributeChangedCallback) {
                node.attributeChangedCallback(
                  current.attributeName,
                  current.oldValue,
                  node.getAttribute(current.attributeName)
                );
              }
            }
          }
        });
      }(executeAction('attached'), executeAction('detached')));
      observer.observe(
        document,
        {
          childList: true,
          subtree: true
        }
      );
    } else {
      document.addEventListener('DOMNodeInserted', onDOMNode('attached'));
      document.addEventListener('DOMNodeRemoved', onDOMNode('detached'));
    }
    document.createElement = function (localName, typeExtension) {
      var i, node = createElement.apply(document, arguments);
      if (typeExtension) {
        node.setAttribute('is', localName = typeExtension.toLowerCase());
      }
      i = indexOf.call(types, localName.toUpperCase());
      if (-1 < i) setupNode(node, protos[i]);
      return node;
    };
    HTMLElementPrototype.cloneNode = function (deep) {
      var
        node = cloneNode.call(this, !!deep),
        i = getTypeIndex(node)
      ;
      if (-1 < i) setupNode(node, protos[i]);
      if (deep) loopAndSetup(node.querySelectorAll(query));
      return node;
    };
  }
  if (-1 < indexOf.call(types, upperType)) {
    throw new Error('A ' + type + ' type is already registered');
  }
  if (!validName.test(upperType) || -1 < indexOf.call(invalidNames, upperType)) {
    throw new Error('The type ' + type + ' is invalid');
  }
  var
    constructor = function () {
      return document.createElement(nodeName, extending && upperType);
    },
    opt = options || OP,
    extending = hOP.call(opt, EXTENDS),
    nodeName = extending ? options[EXTENDS] : upperType,
    i = types.push(upperType) - 1,
    upperType
  ;
  query = query.concat(
    query.length ? ',' : '',
    extending ? nodeName + '[is="' + type.toLowerCase() + '"]' : nodeName
  );
  constructor.prototype = (
    protos[i] = hOP.call(opt, 'prototype') ?
      opt.prototype :
      create(HTMLElementPrototype)
  );

  // do not discover per each register but once
  clearTimeout(initialTrigger);
  // needed to initialize components already present in the DOM
  initialTrigger = setTimeout(discoverUncaughtElements);

  return constructor;
};


}(window, document, Object, 'registerElement'));
(function () {
  function CustomEvent ( event, params ) {
    params = params || { bubbles: false, cancelable: false, detail: undefined };
    var evt = document.createEvent( 'CustomEvent' );
    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
    return evt;
   };

  CustomEvent.prototype = window.Event.prototype;

  window.CustomEvent = CustomEvent;
})();
// DOMTokenList polyfill for IE9
(function () {

if (typeof window.Element === "undefined" || "classList" in document.documentElement) return;

var prototype = Array.prototype,
    indexOf = prototype.indexOf,
    slice = prototype.slice,
    push = prototype.push,
    splice = prototype.splice,
    join = prototype.join;

function DOMTokenList(el) {
  this._element = el;
  if (el.className != this._classCache) {
    this._classCache = el.className;

    if (!this._classCache) return;

      // The className needs to be trimmed and split on whitespace
      // to retrieve a list of classes.
      var classes = this._classCache.replace(/^\s+|\s+$/g,'').split(/\s+/),
        i;
    for (i = 0; i < classes.length; i++) {
      push.call(this, classes[i]);
    }
  }
};

function setToClassName(el, classes) {
  el.className = classes.join(' ');
}

DOMTokenList.prototype = {
  add: function(token) {
    if(this.contains(token)) return;
    push.call(this, token);
    setToClassName(this._element, slice.call(this, 0));
  },
  contains: function(token) {
    return indexOf.call(this, token) !== -1;
  },
  item: function(index) {
    return this[index] || null;
  },
  remove: function(token) {
    var i = indexOf.call(this, token);
     if (i === -1) {
       return;
     }
    splice.call(this, i, 1);
    setToClassName(this._element, slice.call(this, 0));
  },
  toString: function() {
    return join.call(this, ' ');
  },
  toggle: function(token) {
    if (indexOf.call(this, token) === -1) {
      this.add(token);
    } else {
      this.remove(token);
    }
  }
};

window.DOMTokenList = DOMTokenList;

function defineElementGetter (obj, prop, getter) {
  if (Object.defineProperty) {
    Object.defineProperty(obj, prop,{
      get : getter
    })
  } else {
    obj.__defineGetter__(prop, getter);
  }
}

defineElementGetter(Element.prototype, 'classList', function () {
  return new DOMTokenList(this);
});

})();
if (HTMLElement.prototype.createShadowRoot) {
    Platform.shadowDOM = 'native';
} else if (HTMLElement.prototype.webkitCreateShadowRoot && !HTMLElement.prototype.createShadowRoot) {
    // ShadowCSS support is flaky in browsers with ShadowDOM preliminary impls.
    // We'd better override native shadow DOM in this case...
    Platform.shadowDOM = 'prefixed';
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
    Platform.shadowDOM = 'polyfill';
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