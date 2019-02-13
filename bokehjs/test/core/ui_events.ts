import {expect, assert} from "chai"
import * as sinon from 'sinon'

import * as dom from "core/dom"
import {Tap, MouseMove} from "core/bokeh_events"

import {CrosshairTool} from "models/tools/inspectors/crosshair_tool"
import {PanTool} from "models/tools/gestures/pan_tool"
import {PolySelectTool} from "models/tools/gestures/poly_select_tool"
import {SelectTool, SelectToolView} from "models/tools/gestures/select_tool"
import {TapTool} from "models/tools/gestures/tap_tool"
import {WheelZoomTool} from "models/tools/gestures/wheel_zoom_tool"

import {Document} from "document"
import {Legend} from "models/annotations/legend"
import {Plot} from "models/plots/plot"
import {Range1d} from "models/ranges/range1d"
import {UIEvents} from "core/ui_events"

describe("ui_events module", () => {

  beforeEach(() => {
    sinon.stub(UIEvents.prototype as any, "_configure_hammerjs")

    const doc = new Document()
    @plot = new Plot({
      x_range: new Range1d({start: 0, end: 1})
      y_range: new Range1d({start: 0, end: 1})
    })
    doc.add_root(@plot)
    @plot_view = new @plot.default_view({model: @plot, parent: null}).build()
    @ui_events = @plot_view.ui_event_bus
  })

  afterEach(() => {
    UIEvents.prototype._configure_hammerjs.restore()
  })

  describe("_trigger method", () => {

    afterEach(() => {
      @spy_trigger.restore()
    })

    beforeEach(() => {
      @spy_trigger = sinon.spy(@ui_events, "trigger")
    })

    describe("base_type=move", () => {

      beforeEach(() => {
        @e = {type: "mousemove"}

        @spy_cursor = sinon.spy(@plot_view, "set_cursor")
      })

      afterEach(() => {
        @spy_cursor.restore()
      })

      it("should trigger move event for active inspectors", () => {
        const inspector = new CrosshairTool({active: true})
        @plot.add_tools(inspector)

        @ui_events._trigger(@ui_events.move, @e, {target: null})

        assert(@spy_trigger.calledOnce)
        expect(@spy_trigger.args[0]).to.be.deep.equal([@ui_events.move, @e, inspector.id])
      })

      it("should not trigger move event for inactive inspectors", () => {
        const inspector = new CrosshairTool({active: false})
        @plot.add_tools(inspector)

        @ui_events._trigger(@ui_events.move, @e, {target: null})

        assert(@spy_trigger.notCalled)
      })

      it("should use default cursor no active inspector", () => {
        @ui_events._trigger(@ui_events.move, @e, {target: null})

        assert(@spy_cursor.calledOnce)
        assert(@spy_cursor.calledWith("default"))
      })

      it("should use default cursor if active inspector but mouse is off-frame", () => {
        const inspector = new CrosshairTool()
        @plot.add_tools(inspector)

        const ss = sinon.stub(@ui_events, "_hit_test_frame").returns(false)

        @ui_events._trigger(@ui_events.move, @e, {target: null})
        assert(@spy_cursor.calledOnce)
        assert(@spy_cursor.calledWith("default"))

        ss.restore()
      })

      it("should change cursor if active inspector is present and over frame", () => {
        const inspector = new CrosshairTool()
        @plot.add_tools(inspector)

        const ss = sinon.stub(@ui_events, "_hit_test_frame").returns(true)

        @ui_events._trigger(@ui_events.move, @e, {target: null})
        assert(@spy_cursor.calledOnce)
        assert(@spy_cursor.calledWith("crosshair"))

        ss.restore()
      })

      it("should change cursor on view_renderer with cursor method", () => {
        const legend = new Legend({click_policy: "mute"})
        const legend_view = new legend.default_view({model: legend, parent: this.plot_view})

        const ss = sinon.stub(@ui_events, "_hit_test_renderers").returns(legend_view)

        @ui_events._trigger(@ui_events.move, @e, {target: null})
        assert(@spy_cursor.calledOnce)
        assert(@spy_cursor.calledWith("pointer"))

        ss.restore()
      })

      it("should override event_type if active inspector clashes with view renderer", () => {
        const inspector = new CrosshairTool()
        @plot.add_tools(inspector)

        const legend = new Legend({click_policy: "mute"})
        const legend_view = new legend.default_view({model: legend, parent: this.plot_view})

        const ss = sinon.stub(@ui_events, "_hit_test_renderers").returns(legend_view)

        @ui_events._trigger(@ui_events.move, @e, {target: null})
        assert(@spy_trigger.calledOnce)
        expect(@spy_trigger.args[0]).to.be.deep.equal([@ui_events.move_exit, @e, inspector.id])
        // should also use view renderer cursor and not inspector cursor
        assert(@spy_cursor.calledOnce)
        assert(@spy_cursor.calledWith("pointer"))

        ss.restore()
      })
    })

    describe("base_type=tap", () => {

      beforeEach(() => {
        @e = {type: "tap", sx: 10, sy: 15, shiftKey: false}
      })

      it("should not trigger tap event if no active tap tool", () => {
        @ui_events._trigger(@ui_events.tap, @e, {target: null})
        assert(@spy_trigger.notCalled)
      })

      it("should trigger tap event if exists an active tap tool", () => {
        const gesture = new TapTool()
        @plot.add_tools(gesture)

        @ui_events._trigger(@ui_events.tap, @e, {target: null})

        assert(@spy_trigger.calledOnce)
        expect(@spy_trigger.args[0]).to.be.deep.equal([@ui_events.tap, @e, gesture.id])
      })

      it("should call on_hit method on view renderer if exists", () => {
        const legend = new Legend({click_policy: "mute"})
        const legend_view = new legend.default_view({model: legend, parent: this.plot_view})

        const ss = sinon.stub(@ui_events, "_hit_test_renderers").returns(legend_view)
        const on_hit = sinon.stub(legend_view, "on_hit")

        @ui_events._trigger(@ui_events.tap, @e, {target: null})
        assert(on_hit.calledOnce)
        expect(on_hit.args[0]).to.be.deep.equal([10, 15])

        on_hit.restore()
        ss.restore()
      })
    })

    describe("base_type=scroll", () => {

      afterEach(() => {
        @preventDefault.restore()
        @stopPropagation.restore()
      })

      beforeEach(() => {
        @e = {type: "wheel"}
        @srcEvent = new Event("scroll")

        @preventDefault = sinon.spy(@srcEvent, "preventDefault")
        @stopPropagation = sinon.spy(@srcEvent, "stopPropagation")
      })

      it("should not trigger scroll event if no active scroll tool", () => {
        @plot.toolbar.gestures["scroll"].active = null
        @ui_events._trigger(@ui_events.scroll, @e, @srcEvent)
        assert(@spy_trigger.notCalled)

        // assert that default scrolling isn't hijacked
        assert(@preventDefault.notCalled)
        assert(@stopPropagation.notCalled)
      })

      it("should trigger scroll event if exists an active tap tool", () => {
        const gesture = new WheelZoomTool()
        @plot.add_tools(gesture)
        // unclear why add_tools doesn't activate the tool, so have to do it manually
        @plot.toolbar.gestures['scroll'].active = gesture

        @ui_events._trigger(@ui_events.scroll, @e, @srcEvent)

        // assert that default scrolling is disabled
        assert(@preventDefault.calledOnce)
        assert(@stopPropagation.calledOnce)

        assert(@spy_trigger.calledOnce)
        expect(@spy_trigger.args[0]).to.be.deep.equal([@ui_events.scroll, @e, gesture.id])
      })
    })

    describe("normally propagate other gesture base_types", () => {

      beforeEach(() => {
        @e = {type: "pan"}
      })

      it("should not trigger event if no active tool", () => {
        @ui_events._trigger(@ui_events.pan, @e, {target: null})
        assert(@spy_trigger.notCalled)
      })

      it("should trigger event if exists an active related tool", () => {
        const gesture = new PanTool()
        @plot.add_tools(gesture)

        @ui_events._trigger(@ui_events.pan, @e, {target: null})

        assert(@spy_trigger.calledOnce)
        expect(@spy_trigger.args[0]).to.be.deep.equal([@ui_events.pan, @e, gesture.id])
      })
    })
  })

  describe("_bokify methods", () => {

    afterEach(() => {
      @dom_stub.restore()
      @spy.restore()
    })

    beforeEach(() => {
      @dom_stub = sinon.stub(dom, "offset").returns({top: 0, left: 0})
      @spy = sinon.spy(@plot, "trigger_event")
    })

    it("_bokify_hammer should trigger event with appropriate coords and model id", () => {
      const e = new Event("tap") // XXX: <- this is not a hammer event
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      const ev = @ui_events._tap_event(e)
      @ui_events._trigger_bokeh_event(ev)

      const bk_event = @spy.args[0][0]

      expect(bk_event).to.be.instanceof(Tap)
      expect(bk_event.sx).to.be.equal(100)
      expect(bk_event.sy).to.be.equal(200)
      expect(bk_event.origin.id).to.be.equal(@plot.id)
    })

    it("_bokify_point_event should trigger event with appropriate coords and model id", () => {
      const e = new Event("mousemove")
      e.pageX = 100
      e.pageY = 200

      const ev = @ui_events._move_event(e)
      @ui_events._trigger_bokeh_event(ev)

      const bk_event = @spy.args[0][0]

      expect(bk_event).to.be.instanceof(MouseMove)
      expect(bk_event.sx).to.be.equal(100)
      expect(bk_event.sy).to.be.equal(200)
      expect(bk_event.origin.id).to.be.equal(@plot.id)
    })
  })

  describe("_event methods", () => {
    /*
    These tests are mildly integration tests. Based on an Event (as would be
    initiated by event listeners attached in the _register_tool method), they
    check whether the BokehEvent and UIEvents are correctly triggered.
    */

    afterEach(() => {
      @dom_stub.restore()
      @spy_plot.restore()
      @spy_uievent.restore()
    })

    beforeEach(() => {
      @dom_stub = sinon.stub(dom, "offset").returns({top: 0, left: 0})
      // The BokehEvent that is triggered by the plot
      @spy_plot = sinon.spy(@plot, "trigger_event")
      // The event is that triggered on UIEvent for tool interactions
      @spy_uievent = sinon.spy(@plot_view.ui_event_bus, "trigger")
    })

    it("_tap method should handle tap event", () => {
      const e = new Event("tap")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      @plot.add_tools(new TapTool())

      @ui_events._tap(e)

      expect(@spy_plot.callCount).to.be.equal(2) // tap event and selection event
      assert(@spy_uievent.calledOnce)
    })

    it("_doubletap method should handle doubletap event", () => {
      const e = new Event("doubletap")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      @plot.add_tools(new PolySelectTool())

      @ui_events._doubletap(e)

      expect(@spy_plot.callCount).to.be.equal(2) // tap event and selection event
      assert(@spy_uievent.calledOnce)
    })

    it("_press method should handle press event", () => {
      const e = new Event("press")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      @ui_events._press(e)

      assert(@spy_plot.calledOnce)
      // There isn't a tool that uses the _press method
      // assert(@spy_uievent.calledOnce)
      // })

    it("_pan_start method should handle panstart event", () => {
      const e = new Event("panstart")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      const pan_tool = new PanTool()
      @plot.add_tools(pan_tool)

      @ui_events._pan_start(e)

      assert(@spy_plot.called)
      assert(@spy_uievent.calledOnce)
    })

    it("_pan method should handle pan event", () => {
      const e = new Event("pan")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      const pan_tool = new PanTool()
      @plot.add_tools(pan_tool)

      @ui_events._pan(e)

      assert(@spy_plot.called)
      assert(@spy_uievent.calledOnce)
    })

    it("_pan_end method should handle pan end event", () => {
      const e = new Event("panend")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      const pan_tool = new PanTool()
      @plot.add_tools(pan_tool)

      @ui_events._pan_end(e)

      assert(@spy_plot.calledOnce)
      assert(@spy_uievent.calledOnce)
    })

    it("_pinch_start method should handle pinchstart event", () => {
      const e = new Event("pinchstart")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      const wheel_zoom_tool = new WheelZoomTool()
      @plot.add_tools(wheel_zoom_tool)

      //idk why it's not auto active
      @plot.toolbar.gestures['pinch'].active = wheel_zoom_tool

      @ui_events._pinch_start(e)

      assert(@spy_plot.calledOnce)
      // wheelzoomtool doesn't have _pinch_start but will emit event anyway
      assert(@spy_uievent.calledOnce)
    })

    it("_pinch method should handle pinch event", () => {
      const e = new Event("pinch")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      const wheel_zoom_tool = new WheelZoomTool()
      @plot.add_tools(wheel_zoom_tool)

      //idk why it's not auto active
      @plot.toolbar.gestures['pinch'].active = wheel_zoom_tool

      @ui_events._pinch(e)

      assert(@spy_plot.calledOnce)
      assert(@spy_uievent.calledOnce)
    })

    it("_pinch_end method should handle pinchend event", () => {
      const e = new Event("pinchend")
      e.pointerType = "mouse"
      e.srcEvent = {pageX: 100, pageY: 200}

      const wheel_zoom_tool = new WheelZoomTool()
      @plot.add_tools(wheel_zoom_tool)

      //idk why it's not auto active
      @plot.toolbar.gestures['pinch'].active = wheel_zoom_tool

      @ui_events._pinch_end(e)

      assert(@spy_plot.calledOnce)
      // wheelzoomtool doesn't have _pinch_start but will emit event anyway
      assert(@spy_uievent.calledOnce)

    // not implemented as tool method or BokehEvent
    // it("_rotate_start method should handle rotatestart event", () => {

    // not implemented as tool method or BokehEvent
    // it("_rotate method should handle rotate event", () => {

    // not implemented as tool method or BokehEvent
    // it("_rotate_end method should handle rotateend event", () => {
    })

    it("_move_enter method should handle mouseenter event", () => {
      const e = new Event("mouseenter")

      const crosshair_tool = new CrosshairTool()
      @plot.add_tools(crosshair_tool)

      @ui_events._mouse_enter(e)

      assert(@spy_plot.calledOnce)
      assert(@spy_uievent.calledOnce)
    })

    it("_move method should handle mousemove event", () => {
      const e = new Event("mousemove")

      const crosshair_tool = new CrosshairTool()
      @plot.add_tools(crosshair_tool)

      @ui_events._mouse_move(e)

      assert(@spy_plot.calledOnce)
      assert(@spy_uievent.calledOnce)
    })

    it("_move_exit method should handle mouseleave event", () => {
      const e = new Event("mouseleave")

      const crosshair_tool = new CrosshairTool()
      @plot.add_tools(crosshair_tool)

      @ui_events._mouse_exit(e)

      assert(@spy_plot.calledOnce)
      assert(@spy_uievent.calledOnce)
    })

    it("_mouse_wheel method should handle wheel event", () => {
      const e = new Event("wheel")

      const wheel_zoom_tool = new WheelZoomTool()
      @plot.add_tools(wheel_zoom_tool)

      //idk why it's not auto active
      @plot.toolbar.gestures['scroll'].active = wheel_zoom_tool

      @ui_events._mouse_wheel(e)

      assert(@spy_plot.called)
      assert(@spy_uievent.calledOnce)

    // not implemented as tool method or BokehEvent
    // it("_key_down method should handle keydown event", () => {
    })

    it("_key_up method should handle keyup event", () => {
      const e = new Event("keyup")

      const poly_select_tool = new PolySelectTool()
      @plot.add_tools(poly_select_tool)

      @ui_events._key_up(e)

      // There isn't a BokehEvent model for keydown events
      // assert(@spy_plot.calledOnce)
      // This is a event on select tools that should probably be removed
      assert(@spy_uievent.calledOnce)
    })

    it("multi-gesture tool should receive multiple events", () => {
      class MultiToolView extends SelectToolView {
        _tap(e) {}
        _pan(e) {}
      }

      class MultiTool extends SelectTool {
        default_view: MultiToolView
        type: "MultiTool"
        tool_name: "Multi Tool"
        event_type: ["tap", "pan"]
      }

      const tool = new MultiTool()
      @plot.add_tools(tool)
      tool.active = true

      const etap = new Event("tap")
      etap.pointerType = "mouse"
      etap.srcEvent = {pageX: 100, pageY: 200}

      @ui_events._tap(etap)
      assert(@spy_uievent.calledOnce, "Tap event not triggered")

      const epan = new Event("pan")
      epan.pointerType = "mouse"
      epan.srcEvent = {pageX: 100, pageY: 200}
      @ui_events._pan(epan)
      assert(@spy_uievent.calledTwice, "Pan event not triggered")
    })
  })
})
