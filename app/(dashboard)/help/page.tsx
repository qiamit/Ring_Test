export default function HelpPage() {
  return (
    <div className="space-y-4">
      <div className="card px-5 py-4">
        <h1 className="text-lg font-semibold text-white">Help &amp; Workflow</h1>
        <p className="text-sm text-[--color-muted]">
          Quick reference for running ring tests in the web app.
        </p>
      </div>
      <article className="card prose prose-invert max-w-none p-6 text-sm leading-6 text-slate-200">
        <h2 className="text-base font-semibold">Standard workflow</h2>
        <ol className="list-decimal space-y-2 pl-5 text-[--color-muted]">
          <li>
            Open <strong className="text-white">New Test</strong>. Enter sample diameter (mm) and tester
            name. Other fields (batch, mfg date, observations) are optional.
          </li>
          <li>
            <strong className="text-white">Upload an image</strong> of the cut specimen face, or use
            <strong className="text-white"> Start Camera</strong> &rarr;{" "}
            <strong className="text-white">Capture</strong> from a connected webcam.
          </li>
          <li>
            The <strong className="text-white">Inner Ring</strong>, <strong className="text-white">Outer
            Ring</strong>, and <strong className="text-white">Diameter</strong> are placed automatically. Pick a
            mode and drag the centre or the right-edge handle to adjust. Diameter has corner handles.
          </li>
          <li>
            The eight thickness points (t1 – t8) and their values in <span className="font-mono">mm</span>{" "}
            update live. Min, Max, Mean, area shares and the PASS/FAIL verdict (IS 1786:2008) are shown
            beneath the canvas.
          </li>
          <li>
            Click <strong className="text-white">Save Result</strong>. The annotated image is uploaded to
            Firebase Storage and Firestore. Find it later under{" "}
            <strong className="text-white">Reports</strong>.
          </li>
        </ol>

        <h2 className="mt-6 text-base font-semibold">Calibration</h2>
        <p className="text-[--color-muted]">
          For most workflows the <em>diameter box</em> alone gives mm/px (sample diameter ÷ box width).
          For a fixed camera setup, run <strong className="text-white">Validation &amp; Calibration → Linear</strong>{" "}
          once with a ruler to lock a global mm/px override. <strong className="text-white">Angular</strong> calibration
          stores a Δ° offset that rotates the eight thickness markers — useful when the camera is mounted
          slightly tilted.
        </p>

        <h2 className="mt-6 text-base font-semibold">IS 1786:2008 acceptance</h2>
        <ul className="list-disc space-y-1 pl-5 text-[--color-muted]">
          <li>All eight thicknesses must lie within <span className="font-mono">0.07 d – 0.15 d</span>.</li>
          <li>The TM ring area should be <span className="font-mono">30 – 50 %</span> of the total cross-section.</li>
          <li>Both must be true for a PASS verdict.</li>
        </ul>
      </article>
    </div>
  );
}
