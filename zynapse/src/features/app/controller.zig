const std = @import("std");
const JsonValue = std.json.Value;

const spider = @import("spider");
const Response = spider.Response;

const api_base_url = "http://localhost:9908";
const session_cookie = "zynapse_session";

const LoginSignals = struct {
    identifier: []const u8 = "",
    password: []const u8 = "",
};

const ProfileSignals = struct {
    profileFirstName: []const u8 = "",
    profileLastName: []const u8 = "",
    profileUsername: []const u8 = "",
    profileEmail: []const u8 = "",
};

pub fn index(c: *spider.Ctx) !Response {
    return appShell(c, "/ui/session");
}

pub fn profilePage(c: *spider.Ctx) !Response {
    return appShell(c, "/ui/profile");
}

pub fn usersPage(c: *spider.Ctx) !Response {
    return appShell(c, "/ui/users");
}

fn appShell(c: *spider.Ctx, init_endpoint: []const u8) !Response {
    return c.view("app/index", .{ .title = "Zynapse", .initEndpoint = init_endpoint }, .{});
}

pub fn session(c: *spider.Ctx) !Response {
    const token = c.cookie(session_cookie) orelse return datastar(c, try loginScreen(c, null));
    const me = apiGetJson(c, "/auth/me", token) catch return datastar(c, try loginScreen(c, "Session expired. Please sign in again."));
    defer me.deinit();

    const user = getObject(me.value.object.get("data")) orelse return datastar(c, try loginScreen(c, "Unable to load your profile."));
    return datastar(c, try signedInScreen(c, user, null));
}

pub fn login(c: *spider.Ctx) !Response {
    const input = c.bodyJson(LoginSignals) catch LoginSignals{};
    if (input.identifier.len == 0 or input.password.len == 0) {
        return datastar(c, try loginScreen(c, "Enter both username and password."));
    }

    const payload = try std.json.Stringify.valueAlloc(c.arena, .{
        .identifier = input.identifier,
        .password = input.password,
    }, .{});

    var response = spider.http_client.post(c._io, c.arena, try apiUrl(c, "/auth/login"), .{
        .body = spider.http_client.jsonBody(payload),
    }) catch return datastar(c, try loginScreen(c, "Unable to reach the Rebirth API."));
    defer response.deinit();

    if (response.status != .ok) {
        return datastar(c, try loginScreen(c, "Invalid username or password."));
    }

    var parsed = try response.json(JsonValue);
    defer parsed.deinit();

    const data = getObject(parsed.value.object.get("data")) orelse return datastar(c, try loginScreen(c, "Unable to read login response."));
    const session_key = stringField(data, "sessionKey") orelse return datastar(c, try loginScreen(c, "Unable to read session key."));
    const user = getObject(data.get("user")) orelse return datastar(c, try loginScreen(c, "Unable to read user profile."));
    const cookie = try c.setCookie(session_cookie, session_key, .{
        .http_only = true,
        .secure = false,
        .same_site = "Lax",
        .path = "/",
        .max_age = 60 * 60 * 24 * 7,
    });

    return datastarWithHeaders(c, try signedInScreen(c, user, "Signed in."), &.{.{ "Set-Cookie", cookie }});
}

pub fn logout(c: *spider.Ctx) !Response {
    if (c.cookie(session_cookie)) |token| {
        var response = apiPostJson(c, "/auth/logout", token, "{}") catch null;
        if (response) |*res| res.deinit();
    }

    const cookie = try c.setCookie(session_cookie, "", .{
        .http_only = true,
        .secure = false,
        .same_site = "Lax",
        .path = "/",
        .max_age = 0,
    });

    return datastarWithHeaders(c, try loginScreen(c, "Signed out."), &.{.{ "Set-Cookie", cookie }});
}

pub fn profile(c: *spider.Ctx) !Response {
    const token = c.cookie(session_cookie) orelse return datastar(c, try loginScreen(c, "Please sign in first."));
    const me = apiGetJson(c, "/auth/me", token) catch return datastar(c, try errorPanel(c, "Profile", "Unable to load your profile."));
    defer me.deinit();

    const user = getObject(me.value.object.get("data")) orelse return datastar(c, try errorPanel(c, "Profile", "Unable to read profile data."));
    return datastar(c, try contentOnly(c, try profilePanel(c, user, null)));
}

pub fn updateProfile(c: *spider.Ctx) !Response {
    const token = c.cookie(session_cookie) orelse return datastar(c, try loginScreen(c, "Please sign in first."));
    const input = c.bodyJson(ProfileSignals) catch ProfileSignals{};

    const payload = try std.json.Stringify.valueAlloc(c.arena, .{
        .firstName = input.profileFirstName,
        .lastName = input.profileLastName,
        .username = input.profileUsername,
        .email = input.profileEmail,
    }, .{});

    var response = apiPutJson(c, "/user/info", token, payload) catch return datastar(c, try errorPanel(c, "Profile", "Unable to reach the Rebirth API."));
    defer response.deinit();
    if (response.status != .ok) {
        return datastar(c, try errorPanel(c, "Profile", "Unable to update profile."));
    }

    var parsed = try response.json(JsonValue);
    defer parsed.deinit();
    const user = getObject(parsed.value.object.get("data")) orelse return datastar(c, try errorPanel(c, "Profile", "Unable to read updated profile."));
    return datastar(c, try contentOnly(c, try profilePanel(c, user, "Profile saved.")));
}

pub fn users(c: *spider.Ctx) !Response {
    const token = c.cookie(session_cookie) orelse return datastar(c, try loginScreen(c, "Please sign in first."));
    const response = apiGetJson(c, "/users", token) catch return datastar(c, try errorPanel(c, "Users", "Unable to load users."));
    defer response.deinit();

    const user_list = getArray(response.value.object.get("data")) orelse return datastar(c, try errorPanel(c, "Users", "Unable to read users."));
    return datastar(c, try contentOnly(c, try usersPanel(c, user_list)));
}

pub fn usersDraggableModal(c: *spider.Ctx) !Response {
    _ = c.cookie(session_cookie) orelse return datastar(c, try loginScreen(c, "Please sign in first."));
    return datastar(c, usersDraggableModalLayer());
}

pub fn usersModalClose(c: *spider.Ctx) !Response {
    return datastar(c,
        \\<div id="zynapse-modal-layer" class="zynapse-modal-layer"></div>
    );
}

fn apiUrl(c: *spider.Ctx, path: []const u8) ![]const u8 {
    return std.mem.concat(c.arena, u8, &.{ api_base_url, path });
}

fn authHeaders(c: *spider.Ctx, token: []const u8) ![]const std.http.Header {
    const value = try std.fmt.allocPrint(c.arena, "Bearer {s}", .{token});
    const headers = try c.arena.alloc(std.http.Header, 1);
    headers[0] = .{ .name = "Authorization", .value = value };
    return headers;
}

fn apiGetJson(c: *spider.Ctx, path: []const u8, token: []const u8) !std.json.Parsed(JsonValue) {
    var response = try spider.http_client.get(c._io, c.arena, try apiUrl(c, path), .{
        .headers = try authHeaders(c, token),
    });
    defer response.deinit();
    if (response.status != .ok) return error.ApiError;
    return try response.json(JsonValue);
}

fn apiPostJson(c: *spider.Ctx, path: []const u8, token: []const u8, payload: []const u8) !spider.http_client.Response {
    return spider.http_client.post(c._io, c.arena, try apiUrl(c, path), .{
        .headers = try authHeaders(c, token),
        .body = spider.http_client.jsonBody(payload),
    });
}

fn apiPutJson(c: *spider.Ctx, path: []const u8, token: []const u8, payload: []const u8) !spider.http_client.Response {
    return spider.http_client.put(c._io, c.arena, try apiUrl(c, path), .{
        .headers = try authHeaders(c, token),
        .body = spider.http_client.jsonBody(payload),
    });
}

fn datastar(c: *spider.Ctx, html: []const u8) !Response {
    return datastarWithHeaders(c, html, &.{});
}

fn datastarWithHeaders(c: *spider.Ctx, html: []const u8, headers: []const [2][]const u8) !Response {
    var body = std.ArrayList(u8).initCapacity(c.arena, html.len + 128) catch unreachable;
    try body.appendSlice(c.arena, "event: datastar-patch-elements\n");

    var lines = std.mem.splitScalar(u8, html, '\n');
    while (lines.next()) |line| {
        try body.appendSlice(c.arena, "data: elements ");
        try body.appendSlice(c.arena, line);
        try body.append(c.arena, '\n');
    }
    try body.append(c.arena, '\n');

    return Response{
        .status = .ok,
        .body = try body.toOwnedSlice(c.arena),
        .content_type = "text/event-stream; charset=utf-8",
        .headers = headers,
    };
}

fn contentOnly(c: *spider.Ctx, panel: []const u8) ![]const u8 {
    return std.fmt.allocPrint(c.arena,
        \\<main id="app-content" class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:px-6">
        \\{s}
        \\</main>
    , .{panel});
}

fn signedInScreen(c: *spider.Ctx, user: std.json.ObjectMap, message: ?[]const u8) ![]const u8 {
    const profile_html = try profilePanel(c, user, message);
    return std.fmt.allocPrint(c.arena,
        \\<header id="app-header" class="navbar bg-base-100 border-b border-base-300 px-4 lg:px-6">
        \\  <div class="flex-1">
        \\    <a class="btn btn-ghost px-2 text-lg normal-case" href="/">
        \\      <img src="/images/logo.png" alt="" class="h-7 w-7 rounded object-cover">
        \\      <span>Zynapse</span>
        \\    </a>
        \\  </div>
        \\  <nav class="flex items-center gap-1">
        \\    <button class="btn btn-ghost btn-sm" data-zynapse-nav="/profile" data-on:click="@get('/ui/profile')"><i class="ti ti-user" aria-hidden="true"></i>Profile</button>
        \\    <button class="btn btn-ghost btn-sm" data-zynapse-nav="/users" data-on:click="@get('/ui/users')"><i class="ti ti-users" aria-hidden="true"></i>Users</button>
        \\    <button class="btn btn-ghost btn-sm text-error" data-on:click="@post('/ui/logout')"><i class="ti ti-logout" aria-hidden="true"></i>Logout</button>
        \\  </nav>
        \\</header>
        \\<main id="app-content" class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:px-6">
        \\{s}
        \\</main>
    , .{profile_html});
}

fn loginScreen(c: *spider.Ctx, message: ?[]const u8) ![]const u8 {
    const alert = if (message) |msg| try std.fmt.allocPrint(c.arena,
        \\<div class="alert alert-warning"><i class="ti ti-info-circle" aria-hidden="true"></i><span>{s}</span></div>
    , .{try escape(c, msg)}) else "";

    return std.fmt.allocPrint(c.arena,
        \\<header id="app-header" class="navbar bg-base-100 border-b border-base-300 px-4 lg:px-6">
        \\  <div class="flex-1">
        \\    <a class="btn btn-ghost px-2 text-lg normal-case" href="/">
        \\      <img src="/images/logo.png" alt="" class="h-7 w-7 rounded object-cover">
        \\      <span>Zynapse</span>
        \\    </a>
        \\  </div>
        \\  <div class="flex items-center gap-2 text-sm text-base-content/60"><span>Not signed in</span></div>
        \\</header>
        \\<main id="app-content" class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:px-6">
        \\  <section class="mx-auto grid w-full max-w-sm gap-5 pt-16">
        \\    <div>
        \\      <p class="text-sm font-medium text-warning">Rebirth access</p>
        \\      <h1 class="mt-2 text-3xl font-semibold tracking-normal">Sign in</h1>
        \\      <p class="mt-2 text-sm text-base-content/60">Login to enter into Zynapse knowledge space.</p>
        \\    </div>
        \\    {s}
        \\    <form class="grid gap-4">
        \\      <label class="form-control gap-2">
        \\        <span class="label-text text-base-content/60">Username or email</span>
        \\        <input class="input input-bordered" autocomplete="username" data-bind:identifier>
        \\      </label>
        \\      <label class="form-control gap-2">
        \\        <span class="label-text text-base-content/60">Password</span>
        \\        <input class="input input-bordered" type="password" autocomplete="current-password" data-bind:password>
        \\      </label>
        \\      <button class="btn btn-warning" type="button" data-on:click="@post('/ui/login')"><i class="ti ti-login-2" aria-hidden="true"></i>Login</button>
        \\    </form>
        \\  </section>
        \\</main>
    , .{alert});
}

fn profilePanel(c: *spider.Ctx, user: std.json.ObjectMap, message: ?[]const u8) ![]const u8 {
    const first_name = stringField(user, "firstName") orelse "";
    const last_name = stringField(user, "lastName") orelse "";
    const username = stringField(user, "username") orelse "";
    const email = stringField(user, "email") orelse "";
    const id = stringField(user, "id") orelse "";
    const notice = if (message) |msg| try std.fmt.allocPrint(c.arena,
        \\<div class="alert alert-success"><i class="ti ti-circle-check" aria-hidden="true"></i><span>{s}</span></div>
    , .{try escape(c, msg)}) else "";

    return std.fmt.allocPrint(c.arena,
        \\<section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        \\  <div class="grid gap-5">
        \\    <div>
        \\      <p class="text-sm font-medium text-warning">Account</p>
        \\      <h1 class="mt-2 text-3xl font-semibold tracking-normal">Profile</h1>
        \\      <p class="mt-2 text-sm text-base-content/60">Update the identity fields used across Rebirth.</p>
        \\    </div>
        \\    {s}
        \\    <form class="grid gap-4 rounded-lg border border-base-300 bg-base-200 p-5" data-signals="{{profileFirstName: '{s}', profileLastName: '{s}', profileUsername: '{s}', profileEmail: '{s}'}}">
        \\      <div class="grid gap-4 sm:grid-cols-2">
        \\        <label class="form-control gap-2"><span class="label-text text-base-content/60">First name</span><input class="input input-bordered" data-bind:profile-first-name></label>
        \\        <label class="form-control gap-2"><span class="label-text text-base-content/60">Last name</span><input class="input input-bordered" data-bind:profile-last-name></label>
        \\      </div>
        \\      <label class="form-control gap-2"><span class="label-text text-base-content/60">Username</span><input class="input input-bordered" data-bind:profile-username></label>
        \\      <label class="form-control gap-2"><span class="label-text text-base-content/60">Email</span><input class="input input-bordered" type="email" data-bind:profile-email></label>
        \\      <div><button class="btn btn-warning" type="button" data-on:click="@post('/ui/profile')"><i class="ti ti-device-floppy" aria-hidden="true"></i>Save profile</button></div>
        \\    </form>
        \\  </div>
        \\  <aside class="rounded-lg border border-base-300 bg-base-200 p-5">
        \\    <p class="text-sm font-medium text-base-content/60">Signed in as</p>
        \\    <p class="mt-2 text-xl font-semibold">{s}</p>
        \\    <p class="mt-1 break-all text-xs text-base-content/50">{s}</p>
        \\  </aside>
        \\</section>
    , .{
        notice,
        try signalEscape(c, first_name),
        try signalEscape(c, last_name),
        try signalEscape(c, username),
        try signalEscape(c, email),
        try escape(c, username),
        try escape(c, id),
    });
}

fn usersPanel(c: *spider.Ctx, user_values: []const JsonValue) ![]const u8 {
    var rows = std.ArrayList(u8).initCapacity(c.arena, user_values.len * 256) catch unreachable;
    for (user_values) |value| {
        const user = getObjectValue(value) orelse continue;
        try rows.appendSlice(c.arena, "<tr>");
        try appendCell(c, &rows, stringField(user, "username") orelse "");
        try appendCell(c, &rows, stringField(user, "email") orelse "");
        try appendCell(c, &rows, fullName(c, user) catch "");
        try rows.appendSlice(c.arena, "<td class=\"text-right text-base-content/60\">");
        try rows.appendSlice(c.arena, try std.fmt.allocPrint(c.arena, "{d}", .{arrayLen(user.get("permissions"))}));
        try rows.appendSlice(c.arena, " perms</td></tr>");
    }

    return std.fmt.allocPrint(c.arena,
        \\<section class="grid gap-5">
        \\  <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        \\    <div>
        \\      <p class="text-sm font-medium text-warning">Security</p>
        \\      <h1 class="mt-2 text-3xl font-semibold tracking-normal">Users</h1>
        \\      <p class="mt-2 text-sm text-base-content/60">Browse Rebirth users. Create/edit controls can build on this panel next.</p>
        \\    </div>
        \\    <div class="flex flex-wrap gap-2">
        \\      <button class="btn btn-ghost btn-sm" data-on:click="@get('/ui/users')"><i class="ti ti-refresh" aria-hidden="true"></i>Refresh</button>
        \\      <button class="btn btn-warning btn-sm" data-on:click="@get('/ui/users/draggable-modal')"><i class="ti ti-window" aria-hidden="true"></i>Open modal experiment</button>
        \\    </div>
        \\  </div>
        \\  <div class="overflow-x-auto rounded-lg border border-base-300 bg-base-200">
        \\    <table class="table">
        \\      <thead><tr><th>Username</th><th>Email</th><th>Name</th><th class="text-right">Access</th></tr></thead>
        \\      <tbody>{s}</tbody>
        \\    </table>
        \\  </div>
        \\  <div id="zynapse-modal-layer" class="zynapse-modal-layer"></div>
        \\</section>
    , .{try rows.toOwnedSlice(c.arena)});
}

fn usersDraggableModalLayer() []const u8 {
    return
        \\<div id="zynapse-modal-layer" class="zynapse-modal-layer">
        \\  <section class="zynapse-draggable-modal rounded-lg border border-base-300 bg-base-100 shadow-2xl" data-draggable-modal style="left: min(7vw, 6rem); top: 7rem;">
        \\    <header class="zynapse-draggable-handle flex cursor-move select-none items-center justify-between gap-3 border-b border-base-300 px-4 py-3" data-drag-handle>
        \\      <div class="min-w-0">
        \\        <p class="text-xs font-medium uppercase text-warning">Datastar experiment</p>
        \\        <h2 class="truncate text-base font-semibold">Draggable Users modal</h2>
        \\      </div>
        \\      <button class="btn btn-ghost btn-sm btn-square" title="Close" data-on:click="@get('/ui/users/modal/close')"><i class="ti ti-x" aria-hidden="true"></i></button>
        \\    </header>
        \\    <div class="grid gap-4 p-4 text-sm">
        \\      <p class="text-base-content/70">This modal was inserted by a Datastar patch from the Users section. Dragging is handled locally so pointer movement stays instant.</p>
        \\      <div class="rounded-lg border border-base-300 bg-base-200 p-3">
        \\        <p class="font-medium">What this proves</p>
        \\        <p class="mt-1 text-base-content/60">Server-rendered modal lifecycle and reusable client-side drag behavior can live together cleanly.</p>
        \\      </div>
        \\    </div>
        \\  </section>
        \\</div>
    ;
}

fn errorPanel(c: *spider.Ctx, title: []const u8, message: []const u8) ![]const u8 {
    return std.fmt.allocPrint(c.arena,
        \\<main id="app-content" class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:px-6">
        \\  <section class="rounded-lg border border-error/30 bg-base-200 p-5">
        \\    <p class="text-sm font-medium text-error">{s}</p>
        \\    <h1 class="mt-2 text-2xl font-semibold">{s}</h1>
        \\  </section>
        \\</main>
    , .{ try escape(c, title), try escape(c, message) });
}

fn appendCell(c: *spider.Ctx, rows: *std.ArrayList(u8), value: []const u8) !void {
    try rows.appendSlice(c.arena, "<td>");
    try rows.appendSlice(c.arena, try escape(c, value));
    try rows.appendSlice(c.arena, "</td>");
}

fn fullName(c: *spider.Ctx, user: std.json.ObjectMap) ![]const u8 {
    return std.fmt.allocPrint(c.arena, "{s} {s}", .{
        stringField(user, "firstName") orelse "",
        stringField(user, "lastName") orelse "",
    });
}

fn getObject(value: ?JsonValue) ?std.json.ObjectMap {
    const v = value orelse return null;
    return getObjectValue(v);
}

fn getObjectValue(value: JsonValue) ?std.json.ObjectMap {
    return switch (value) {
        .object => |object| object,
        else => null,
    };
}

fn getArray(value: ?JsonValue) ?[]const JsonValue {
    const v = value orelse return null;
    return switch (v) {
        .array => |array| array.items,
        else => null,
    };
}

fn stringField(object: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    const value = object.get(key) orelse return null;
    return switch (value) {
        .string => |string| string,
        else => null,
    };
}

fn arrayLen(value: ?JsonValue) usize {
    const items = getArray(value) orelse return 0;
    return items.len;
}

fn escape(c: *spider.Ctx, value: []const u8) ![]const u8 {
    var out = std.ArrayList(u8).initCapacity(c.arena, value.len) catch unreachable;
    for (value) |ch| {
        switch (ch) {
            '&' => try out.appendSlice(c.arena, "&amp;"),
            '<' => try out.appendSlice(c.arena, "&lt;"),
            '>' => try out.appendSlice(c.arena, "&gt;"),
            '"' => try out.appendSlice(c.arena, "&quot;"),
            '\'' => try out.appendSlice(c.arena, "&#39;"),
            else => try out.append(c.arena, ch),
        }
    }
    return out.toOwnedSlice(c.arena);
}

fn signalEscape(c: *spider.Ctx, value: []const u8) ![]const u8 {
    var out = std.ArrayList(u8).initCapacity(c.arena, value.len) catch unreachable;
    for (value) |ch| {
        switch (ch) {
            '&' => try out.appendSlice(c.arena, "&amp;"),
            '<' => try out.appendSlice(c.arena, "&lt;"),
            '>' => try out.appendSlice(c.arena, "&gt;"),
            '"' => try out.appendSlice(c.arena, "&quot;"),
            '\\' => try out.appendSlice(c.arena, "\\\\"),
            '\'' => try out.appendSlice(c.arena, "\\'"),
            '\n' => try out.appendSlice(c.arena, "\\n"),
            '\r' => {},
            else => try out.append(c.arena, ch),
        }
    }
    return out.toOwnedSlice(c.arena);
}
