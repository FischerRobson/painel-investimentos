package br.com.painel.util;

import br.com.painel.dto.Point;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

// Drops bad quotes from series (Yahoo sometimes records R$ 1.06 for a R$ 100 share):
// keeps only points between 60% and 160% of the median of the 5 neighbours on each side.
public final class PriceCleaner {

    private static final int WINDOW = 5;
    private static final double MIN_RATIO = 0.6;
    private static final double MAX_RATIO = 1.6;

    private PriceCleaner() {
    }

    public static List<Point> clean(List<Point> points) {
        int n = points.size();
        List<Point> out = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            int from = Math.max(0, i - WINDOW);
            int to = Math.min(n, i + WINDOW + 1);
            double[] near = new double[to - from];
            for (int j = from; j < to; j++) {
                near[j - from] = points.get(j).v();
            }
            Arrays.sort(near);
            double median = near[near.length / 2];
            double ratio = points.get(i).v() / median;
            if (median != 0 && ratio > MIN_RATIO && ratio < MAX_RATIO) {
                out.add(points.get(i));
            }
        }
        return out;
    }
}
