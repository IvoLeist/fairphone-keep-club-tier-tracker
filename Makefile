PORT ?= 8000
URL := localhost:$(PORT)

.PHONY: help serve open deploy stop

help:
	@printf "Targets:\n"
	@printf "  make serve  - start a local web server on port %s\n" "$(PORT)"
	@printf "  make open   - open the local app in the default browser\n"
	@printf "  make deploy - push the current commit to origin/gh-pages\n"
	@printf "  make help   - show this help\n"

serve:
	python3 -m http.server $(PORT)

stop:
	@if pids=$$(lsof -t -iTCP:$(PORT) -sTCP:LISTEN 2>/dev/null) ; then \
		echo "Stopping server on port $(PORT): $$pids" ; \
		kill $$pids || true ; \
	else \
		echo "No server listening on port $(PORT)" ; \
	fi

open:
	open $(URL)

deploy:
	git push origin HEAD:gh-pages