package com.telpo.tps550.api.printer;

import android.content.Context;

/**
 * Compatibility bridge for Saleh M1 app.
 * Delegates the app's existing printer calls to Telpo's official SDK:
 * com.common.apiutil.printer.UsbThermalPrinter
 */
public class UsbThermalPrinter {
    private final com.common.apiutil.printer.UsbThermalPrinter printer;

    public UsbThermalPrinter(Context context) {
        printer = new com.common.apiutil.printer.UsbThermalPrinter(context);
    }

    public void start(int type) throws Exception {
        printer.start(type);
    }

    public void reset() throws Exception {
        printer.reset();
    }

    public void setAlgin(int align) throws Exception {
        printer.setAlgin(align);
    }

    public void setLeftIndent(int indent) throws Exception {
        printer.setLeftIndent(indent);
    }

    public void setLineSpace(int space) throws Exception {
        printer.setLineSpace(space);
    }

    public void setGray(int gray) throws Exception {
        printer.setGray(gray);
    }

    public void addString(String text) throws Exception {
        printer.addString(text);
    }

    public void printString() throws Exception {
        printer.printString();
    }

    public void walkPaper(int lines) throws Exception {
        printer.walkPaper(lines);
    }

    public void stop() {
        printer.stop();
    }
}
