import * as d from '@declarations';
import { consoleError, plt } from '@platform';
import { attachStyles } from './styles';
import { BUILD } from '@build-conditionals';
import { renderVdom } from './vdom/render';

export const emitLifecycleEvent = (elm: d.HostElement, name: string) => {
  if (BUILD.lifecycleDOMEvents) {
    elm.dispatchEvent(new CustomEvent(`stencil_${name}`, {bubbles: true, composed: true}));
  }
};

export const update = async (elm: d.HostElement, instance: any, hostRef: d.HostRef, cmpMeta: d.ComponentRuntimeMeta, isInitialLoad?: boolean, ancestorsActivelyLoadingChildren?: Set<d.HostElement>) => {
  // update
  if (BUILD.updatable) {
    hostRef.isQueuedForUpdate = false;
  }


  try {
    if (isInitialLoad) {
      emitLifecycleEvent(elm, 'componentWillLoad');
      if (BUILD.cmpWillLoad && instance.componentWillLoad) {
        await instance.componentWillLoad();
      }

    } else {
      emitLifecycleEvent(elm, 'componentWillUpdate');

      if (BUILD.cmpWillUpdate && instance.componentWillUpdate) {
        await instance.componentWillUpdate();
      }
    }
    emitLifecycleEvent(elm, 'componentWillRender');
    if (BUILD.cmpWillRender && instance.componentWillRender) {
      await instance.componentWillRender();
    }
  } catch (e) {
    consoleError(e);
  }

  if (BUILD.shadowDom && isInitialLoad && plt.supportsShadowDom && cmpMeta.cmpShadowDomEncapsulation) {
    // DOM WRITE
    // this component is using shadow dom
    // and this browser supports shadow dom
    // add the read-only property "shadowRoot" to the host element
    elm.attachShadow({ mode: 'open' });
  }

  if (BUILD.hasRenderFn || BUILD.reflect) {

    try {
      // tell the platform we're actively rendering
      // if a value is changed within a render() then
      // this tells the platform not to queue the change
      if (BUILD.updatable) {
        hostRef.isActiveRender = true;
      }

      // if (BUILD.reflectToAttr && reflectHostAttr) {
      //   vnodeHostData = vnodeHostData ? Object.assign(vnodeHostData, reflectHostAttr) : reflectHostAttr;
      // }

      // looks like we've got child nodes to render into this host element
      // or we need to update the css class/attrs on the host element

      if (BUILD.vdomRender || BUILD.reflect) {
        // DOM WRITE!
        renderVdom(
          elm,
          hostRef,
          cmpMeta,
          (BUILD.allRenderFn) ? instance.render() : (instance.render && instance.render()),
        );
      }

    } catch (e) {
      consoleError(e);
    }
    if (BUILD.updatable) {
      // tell the platform we're done rendering
      // now any changes will again queue
      hostRef.isActiveRender = false;
    }
  }

  if (BUILD.style && isInitialLoad) {
    // DOM WRITE!
    attachStyles(elm);

    // if (BUILD.scoped) {
    //   const scopeId = elm['s-sc'];
    //   if (scopeId) {
    //     elm.classList.add(getElementScopeId(scopeId, true));

    //     if (encapsulation === 'scoped') {
    //       elm.classList.add(getElementScopeId(scopeId));
    //     }
    //   }
    // }
  }

  if (BUILD.lifecycle || BUILD.style) {
    // it's official, this element has rendered
    // DOM WRITE!
    hostRef.hasRendered = elm['s-rn'] = true;
  } else if (BUILD.updatable) {
    // DOM WRITE!
    hostRef.hasRendered = true;
  }

  if (BUILD.lifecycle && elm['s-rc']) {
    // ok, so turns out there are some child host elements
    // waiting on this parent element to load
    // let's fire off all update callbacks waiting
    elm['s-rc'].forEach(cb => cb());
    elm['s-rc'] = undefined;
  }

  // update styles!
  // if (BUILD.polyfills && plt.customStyle) {
  //   plt.customStyle.updateHost(elm);
  // }

  try {
    if (isInitialLoad) {
      if (BUILD.cmpDidLoad && instance.componentDidLoad) {
        instance.componentDidLoad();
      }
      emitLifecycleEvent(elm, 'componentDidLoad');

    } else {
      if (BUILD.cmpDidUpdate && instance.componentDidUpdate) {
        // we've already loaded this component
        // fire off the user's componentDidUpdate method (if one was provided)
        // componentDidUpdate runs AFTER render() has been called
        // and all child components have finished updating
        instance.componentDidUpdate();
      }
      emitLifecycleEvent(elm, 'componentDidUpdate');
    }
    if (BUILD.cmpDidRender && instance.componentDidRender) {
      instance.componentDidRender();
    }
    emitLifecycleEvent(elm, 'componentDidRender');

  } catch (e) {
    consoleError(e);
  }

  // if (BUILD.polyfills && !allChildrenHaveConnected(plt, elm)) {
  //   // this check needs to be done when using the customElements polyfill
  //   // since the polyfill uses MutationObserver which causes the
  //   // connectedCallbacks to fire async, which isn't ideal for the code below
  //   return;
  // }

  // load events fire from bottom to top
  // the deepest elements load first then bubbles up
  // load events fire from bottom to top
  // the deepest elements load first then bubbles up
  if (BUILD.lifecycle && hostRef.ancestorHostElement) {
    // ok so this element already has a known ancestor host element
    // let's make sure we remove this element from its ancestor's
    // known list of child elements which are actively loading
    ancestorsActivelyLoadingChildren = hostRef.ancestorHostElement['s-al'];

    if (ancestorsActivelyLoadingChildren) {
      // remove this element from the actively loading map
      ancestorsActivelyLoadingChildren.delete(elm);

      // the ancestor's initLoad method will do the actual checks
      // to see if the ancestor is actually loaded or not
      // then let's call the ancestor's initLoad method if there's no length
      // (which actually ends up as this method again but for the ancestor)
      if (!ancestorsActivelyLoadingChildren.size) {
        hostRef.ancestorHostElement['s-init']();
      }
    }

    hostRef.ancestorHostElement = undefined;
  }

  // all is good, this component has been told it's time to finish loading
  // it's possible that we've already decided to destroy this element
  // check if this element has any actively loading child elements
  if (BUILD.lifecycle && (!elm['s-al'] || !elm['s-al'].size)) {
    // cool, so at this point this element isn't already being destroyed
    // and it does not have any child elements that are still loading

    // ensure we remove any child references cuz it doesn't matter at this point
    elm['s-al'] = undefined;

    if (BUILD.style) {
      // DOM WRITE!
      // add the css class that this element has officially hydrated
      elm.classList.add('hydrated');
    }
  }

  if (BUILD.hotModuleReplacement) {
    elm['s-hmr-load'] && elm['s-hmr-load']();
  }

  if (BUILD.lazyLoad && isInitialLoad && hostRef.onReadyResolve) {
    // fire off the user's elm.componentOnReady() resolve (if any)
    hostRef.onReadyResolve(elm);
  }

  // ( •_•)
  // ( •_•)>⌐■-■
  // (⌐■_■)
};
