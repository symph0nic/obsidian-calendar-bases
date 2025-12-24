import { Plugin } from "obsidian";
import { CalendarView, CalendarViewType } from "./calendar-view";
import { LinearView, LinearViewType } from "./linear-view";

export default class ObsidianCalendarPlugin extends Plugin {
  async onload() {
    this.registerBasesView(CalendarViewType, {
      name: "Calendar",
      icon: "lucide-calendar",
      factory: (controller, containerEl) =>
        new CalendarView(controller, containerEl),
      options: CalendarView.getViewOptions,
    });

    this.registerBasesView(LinearViewType, {
      name: "Linear Calendar",
      icon: "lucide-calendar-range",
      factory: (controller, containerEl) =>
        new LinearView(controller, containerEl),
      options: LinearView.getViewOptions,
    });
  }

  onunload() {}
}
