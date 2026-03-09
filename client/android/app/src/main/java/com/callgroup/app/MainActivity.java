package com.callgroup.app;

import android.os.Bundle;
import android.view.View;
import android.view.Window;

import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(ContextCompat.getColor(this, R.color.colorPrimary));
        window.setNavigationBarColor(ContextCompat.getColor(this, R.color.colorPrimaryDark));

        // Use edge-to-edge so transient system bars (swipe gestures) overlay content
        // instead of resizing/pushing the WebView down.
        WindowCompat.setDecorFitsSystemWindows(window, false);

        View content = window.getDecorView().findViewById(android.R.id.content);
        if (content == null) return;
        content.setBackgroundColor(ContextCompat.getColor(this, R.color.colorPrimaryDark));

        final int baseLeft = content.getPaddingLeft();
        final int baseTop = content.getPaddingTop();
        final int baseRight = content.getPaddingRight();
        final int baseBottom = content.getPaddingBottom();

        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(
                baseLeft + systemBars.left,
                baseTop,
                baseRight + systemBars.right,
                baseBottom + systemBars.bottom
            );
            return insets;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
