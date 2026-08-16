from fastapi import Request
from fastapi.responses import RedirectResponse

from app import app, current_user


@app.get("/shop")
def shop_entry(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse(url="/login?next=/shop", status_code=303)

    if user["role"] == "branch":
        if not user.get("branch_id"):
            return RedirectResponse(url="/login", status_code=303)
        return RedirectResponse(url=f"/branch/{user['branch_id']}", status_code=303)

    if user["role"] in {"admin", "manager"}:
        return RedirectResponse(url="/admin", status_code=303)

    return RedirectResponse(url="/login", status_code=303)
