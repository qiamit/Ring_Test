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
            Open <strong className="text-white">New Test</strong>. Fill{" "}
            <strong className="text-white">Sample Information</strong>: enter{" "}
            <strong className="text-white">Sample Diameter in mm</strong> (required).{" "}
            <strong className="text-white">Sample Description</strong>,{" "}
            <strong className="text-white">Batch Number</strong>, and{" "}
            <strong className="text-white">MFG Date</strong> are optional.
          </li>
          <li>
            Click <strong className="text-white">Do Analysis</strong> to open the fullscreen analysis
            workspace.
          </li>
          <li>
            Use <strong className="text-white">Upload Image</strong> or{" "}
            <strong className="text-white">Start Camera</strong> &rarr;{" "}
            <strong className="text-white">Capture</strong> for the cut specimen face. Optionally improve
            the image under <strong className="text-white">Image Adjust</strong> (
            <strong className="text-white">Auto Enhance Quality</strong>,{" "}
            <strong className="text-white">Pixel Update (Sharpen)</strong>, filters, rotate, flip, crop).
          </li>
          <li>
            Set scale with <strong className="text-white">mm/px</strong>: draw a calibration line on the
            image and enter its known length in mm.
          </li>
          <li>
            Draw or detect rings with <strong className="text-white">Inner Ring</strong> and{" "}
            <strong className="text-white">Outer Ring</strong> (Circle or Polygonal;{" "}
            <strong className="text-white">Auto Detect</strong> when available). Optionally adjust{" "}
            <strong className="text-white">Diameter</strong> and enable{" "}
            <strong className="text-white">Thickness Points</strong> (t1–t8). Use{" "}
            <strong className="text-white">Reset Drawing</strong> to clear overlays while keeping the
            image and mm/px scale. If AI is enabled for your firm,{" "}
            <strong className="text-white">AI Analysis</strong> can place geometry automatically.
          </li>
          <li>
            Click <strong className="text-white">View Result</strong> to open{" "}
            <strong className="text-white">Analysis Results</strong> (thickness table, area shares, PASS /
            FAIL). Then <strong className="text-white">Save Result</strong>, enter{" "}
            <strong className="text-white">Operator Name</strong> and optional{" "}
            <strong className="text-white">Observation</strong>, and confirm{" "}
            <strong className="text-white">Save</strong>.
          </li>
          <li>
            Open saved tests later under <strong className="text-white">Reports</strong>. Use{" "}
            <strong className="text-white">View</strong> for the print sheet,{" "}
            <strong className="text-white">Report Settings</strong> for page/print/image layout, and{" "}
            <strong className="text-white">Print / PDF</strong> to export.
          </li>
        </ol>

        <h2 className="mt-6 text-base font-semibold">Scale (mm/px)</h2>
        <p className="text-[--color-muted]">
          Prefer setting <strong className="text-white">mm/px</strong> on each test inside Do Analysis
          (calibration line + known length). If a test has no scale yet, Settings &rarr;{" "}
          <strong className="text-white">mm/px override</strong> can act as a fallback for a fixed camera
          setup.
        </p>

        <h2 className="mt-6 text-base font-semibold">Settings</h2>
        <ul className="list-disc space-y-1 pl-5 text-[--color-muted]">
          <li>
            <strong className="text-white">Calibration overrides</strong> — mm/px fallback and units
            (mm / inch). <strong className="text-white">Camera Setting</strong> previews devices for this
            browser session only (not saved with settings).
          </li>
          <li>
            <strong className="text-white">Drawing style</strong> — colors and line widths for Inner /
            Outer / Diameter / Thickness, plus gaps from outer and inner ring.
          </li>
          <li>
            <strong className="text-white">Company Details for Letter Head</strong> — logo and company
            fields used on printed reports.
          </li>
        </ul>

        <h2 className="mt-6 text-base font-semibold">IS 1786:2008 acceptance</h2>
        <ul className="list-disc space-y-1 pl-5 text-[--color-muted]">
          <li>
            All eight thicknesses must lie within{" "}
            <span className="font-mono">0.07 d – 0.15 d</span>.
          </li>
          <li>
            The TM ring area should be <span className="font-mono">30 – 50 %</span> of the total
            cross-section.
          </li>
          <li>Both must be true for a PASS verdict.</li>
        </ul>

        <h2 className="mt-6 text-base font-semibold">Tips</h2>
        <ul className="list-disc space-y-1 pl-5 text-[--color-muted]">
          <li>
            Sample diameter is required before <strong className="text-white">Do Analysis</strong> and
            before save.
          </li>
          <li>
            Work-in-progress sample data and drawings may restore from a local draft after refresh.
          </li>
          <li>
            <strong className="text-white">Close</strong> exits analysis without saving to Reports; use{" "}
            <strong className="text-white">Save Result</strong> to store the test.
          </li>
          <li>
            <strong className="text-white">AI Analysis</strong> appears only when Super Admin has enabled
            AI for your organization and configured a model.
          </li>
        </ul>
      </article>
    </div>
  );
}
