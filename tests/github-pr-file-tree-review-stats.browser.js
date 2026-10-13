// Run in a browser with the userscript source passed to this function.
// Uses an isolated HTML document; no GitHub review state is changed.
async function testPrFileTreeReviewStats(source) {
	const results = [];
	function assert(condition, message) {
		if (!condition) throw new Error(message);
	}

	for (const modern of [true, false]) {
		const doc = document.implementation.createHTMLDocument("PR fixture");
		doc.body.innerHTML = `
			<ul role="tree" aria-label="File Tree">
				<li class="file-tree-row__nVsQSE" role="treeitem">
					<div class="prc-TreeView-TreeViewItemContent-RKsCI">
						<span class="prc-TreeView-TreeViewItemContentText-FFaKp">
							<a href="#diff-example">example.js</a>
						</span>
					</div>
				</li>
			</ul>
			<div id="diff-example" ${modern ? 'role="region" aria-labelledby="file-heading" class="diffTargetable__jbrCub"' : 'class="js-file"'}>
				<div ${modern ? 'data-diff-header-wrapper="true" class="diffHeaderWrapper__INiK1j"' : 'class="file-header"'}>
					<h3 id="file-heading">example.js</h3>
					<span class="sr-only">Lines changed: 10 additions &amp; 3 deletions</span>
					${modern ? '<button class="iconOnly__kjZ2po" aria-label="Not Viewed" aria-pressed="false"><span>Viewed</span></button>' : '<input class="js-reviewed-checkbox" type="checkbox">'}
				</div>
			</div>`;
		const route = { pathname: "/owner/repo/pull/1/changes" };
		const win = new EventTarget();
		const frames = [];
		const run = new Function(
			"document", "window", "location", "history", "requestAnimationFrame",
			`${source}\nreturn stopPrFilesPage;`,
		);
		const stop = run(doc, win, route, { pushState() {}, replaceState() {} }, (callback) => frames.push(callback));
		async function settle() {
			for (let turn = 0; turn < 10; turn++) {
				await Promise.resolve();
				if (!frames.length) return;
				frames.splice(0).forEach((callback) => callback());
			}
			throw new Error("Updates did not settle");
		}
		try {
			await settle();
			const row = doc.querySelector('[role="treeitem"]');
			const stats = () => row.querySelectorAll(".rgh-pr-file-tree-review-stats");
			assert(stats().length === 1, `${modern ? "modern" : "legacy"}: missing file stats`);
			assert(stats()[0].textContent === "+10-3", "Incorrect line counts");
			assert(row.getAttribute("data-rgh-pr-file-viewed") === "false", "Unviewed state missing");
			const control = doc.querySelector(modern ? "button" : "input");
			if (modern) {
				control.querySelector("span").dispatchEvent(new MouseEvent("click", { bubbles: true }));
				assert(row.getAttribute("data-rgh-pr-file-viewed") === "true", "New Viewed button click was missed");
				control.setAttribute("aria-pressed", "true");
				control.setAttribute("aria-label", "Viewed");
				await settle();
				control.setAttribute("aria-pressed", "false");
				control.setAttribute("aria-label", "Not Viewed");
			} else {
				control.checked = true;
				control.dispatchEvent(new Event("change", { bubbles: true }));
				assert(row.getAttribute("data-rgh-pr-file-viewed") === "true", "Checkbox change was missed");
				control.checked = false;
				control.dispatchEvent(new Event("change", { bubbles: true }));
			}
			await settle();
			assert(row.getAttribute("data-rgh-pr-file-viewed") === "false", "Viewed state did not resync");
			doc.querySelector(".sr-only").firstChild.textContent = "Lines changed: 2 additions & 1 deletion";
			await settle();
			assert(stats().length === 1 && stats()[0].textContent === "+2-1", "Stats did not update idempotently");
			results.push(`${modern ? "modern" : "legacy"}: stats, Viewed events, mutations, idempotence passed`);
		} finally {
			stop();
		}
	}
	return results;
}
