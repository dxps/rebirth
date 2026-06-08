const std = @import("std");
const spider = @import("spider");
const features = @import("features");
const Response = spider.Response;
const app = features.app;
const db = spider.pg;

pub const spider_templates = @import("embedded_templates.zig").EmbeddedTemplates;

pub fn main(init: std.process.Init) !void {
    const allocator = init.arena.allocator();
    const io = init.io;

    try db.init(allocator, io, .{});
    defer db.deinit();

    var server = spider.app(.{});
    defer server.deinit();

    server
        .get("/", app.index)
        .get("/profile", app.profilePage)
        .get("/users", app.usersPage)
        .get("/ui/session", app.session)
        .post("/ui/login", app.login)
        .post("/ui/logout", app.logout)
        .get("/ui/profile", app.profile)
        .post("/ui/profile", app.updateProfile)
        .get("/ui/users", app.users)
        .get("/ui/users/draggable-modal", app.usersDraggableModal)
        .get("/ui/users/:id/modal", app.userDetailsModal)
        .get("/ui/users/modal/close", app.usersModalClose)
        .onError(errorHandler)
        .listen(.{ .port = 3000, .host = "0.0.0.0" }) catch |err| return err;
}

fn errorHandler(c: *spider.Ctx, err: anyerror) !Response {
    return switch (err) {
        error.TemplateNotFound => c.text("Template not found", .{ .status = .not_found }),
        else => c.text(@errorName(err), .{ .status = .internal_server_error }),
    };
}
